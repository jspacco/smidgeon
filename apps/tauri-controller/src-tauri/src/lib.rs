use tauri::Emitter;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use std::io::Cursor;
use scap::capturer::{get_output_frame_size as scap_frame_size, Options as ScapOptions, Resolution};

// ---------------------------------------------------------------------------
// OAuth command (existing)
// ---------------------------------------------------------------------------

#[tauri::command]
async fn start_oauth(app: tauri::AppHandle) -> Result<u16, String> {
    tauri_plugin_oauth::start(move |url| {
        let _ = app.emit("oauth-callback", url);
    })
    .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Display info type returned to the frontend
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
struct DisplayInfo {
    id: u32,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f32,
    is_primary: bool,
}

// ---------------------------------------------------------------------------
// Core capture implementation — unified via scap (ScreenCaptureKit on macOS,
// Windows.Graphics.Capture on Windows).
//
// scap uses cidre as its macOS backend, which requires full Xcode (not just
// Command Line Tools) due to xcodebuild calls in cidre's build.rs.
// Full Xcode 26.3 is now installed, unblocking this migration.
//
// Previously used: screenshots crate (CGWindowListCreateImage) + core-graphics
// (CGDisplayCreateImage). CGWindowListCreateImage excluded system UI layers
// (menu bar, Dock, other app windows). CGDisplayCreateImage was the correct
// fix but required a macOS-only cfg split. scap unifies both platforms.
// ---------------------------------------------------------------------------

/// Build a minimal ScapOptions struct targeting a specific display.
/// Used both for dimension queries (scap_frame_size) and actual captures.
fn display_options(target: scap::Target) -> ScapOptions {
    ScapOptions {
        fps: 1,
        target: Some(target),
        output_type: scap::frame::FrameType::BGRAFrame,
        output_resolution: Resolution::Captured,
        show_cursor: false,
        ..Default::default()
    }
}

/// Capture the display identified by `display_id` and return a base64-encoded JPEG.
fn capture_display_impl(display_id: u32) -> Result<String, String> {
    let perm = scap::has_permission();
    log::info!("capture_display_impl: entry display_id={display_id} has_permission={perm}");
    if !perm {
        log::warn!("capture_display_impl: permission denied — returning error");
        return Err("screen_recording_permission_denied".to_string());
    }
    use scap::capturer::Capturer;
    use scap::frame::{Frame, VideoFrame};

    // Find the scap Target::Display matching the requested id.
    let targets = scap::get_all_targets();
    let target = targets
        .into_iter()
        .find(|t| matches!(t, scap::Target::Display(d) if d.id == display_id))
        .ok_or_else(|| format!("Display {display_id} not found"))?;

    let options = display_options(target);

    let mut capturer = Capturer::build(options)
        .map_err(|e| format!("Failed to build capturer: {e}"))?;
    capturer.start_capture();

    let frame = capturer
        .get_next_frame()
        .map_err(|e| format!("Failed to get frame: {e}"))?;
    capturer.stop_capture();

    let (width, height, data) = match frame {
        Frame::Video(VideoFrame::BGRA(f)) => (f.width as u32, f.height as u32, f.data),
        Frame::Video(_) => return Err("Unexpected video frame type (expected BGRA)".to_string()),
        Frame::Audio(_) => return Err("Received audio frame instead of video".to_string()),
    };

    log::info!(
        "capture_display_impl: captured display={display_id} size={width}x{height} raw_bytes={}",
        data.len()
    );

    // scap BGRA frame: byte order per pixel is B G R A.
    // image crate's Rgba<u8> expects R G B A. Swap B↔R in place.
    let mut rgba = data;
    for pixel in rgba.chunks_exact_mut(4) {
        pixel.swap(0, 2); // B↔R
    }

    let img_buf = image::ImageBuffer::<image::Rgba<u8>, Vec<u8>>::from_raw(width, height, rgba)
        .ok_or_else(|| "Failed to create RGBA image buffer".to_string())?;

    let dynamic_img = image::DynamicImage::ImageRgba8(img_buf);
    let mut jpeg_bytes = Vec::<u8>::new();
    dynamic_img
        .write_to(&mut Cursor::new(&mut jpeg_bytes), image::ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;

    log::info!("capture_display_impl: success JPEG={} bytes", jpeg_bytes.len());

    Ok(STANDARD.encode(&jpeg_bytes))
}

// ---------------------------------------------------------------------------
// Screenshot commands
// ---------------------------------------------------------------------------

/// Return metadata for all connected displays.
///
/// Dimensions come from scap::capturer::get_output_frame_size (a standalone
/// function that computes physical pixel dimensions from the display target
/// without requiring screen recording permission or starting a capture).
///
/// x, y are not exposed by scap and default to 0. scale_factor defaults to
/// 1.0 — the width/height returned are already physical pixels (logical ×
/// scale), so the frontend display picker shows correct native resolution.
#[tauri::command]
fn list_displays() -> Result<Vec<DisplayInfo>, String> {
    let perm = scap::has_permission();
    log::info!("list_displays: entry has_permission={perm}");
    if !perm {
        log::warn!("list_displays: permission denied — returning error");
        return Err("screen_recording_permission_denied".to_string());
    }
    let main_display = scap::get_main_display();
    let targets = scap::get_all_targets();

    let mut displays = Vec::new();
    for target in &targets {
        if let scap::Target::Display(d) = target {
            let opts = ScapOptions {
                fps: 1,
                target: Some(target.clone()),
                output_resolution: Resolution::Captured,
                ..Default::default()
            };
            let [w, h] = scap_frame_size(&opts);
            displays.push(DisplayInfo {
                id: d.id,
                x: 0,
                y: 0,
                width: w,
                height: h,
                scale_factor: 1.0,
                is_primary: d.id == main_display.id,
            });
        }
    }
    log::info!("list_displays: success count={}", displays.len());
    Ok(displays)
}

/// Capture a specific display by id and return a base64-encoded JPEG.
/// Used when the user has manually selected a display in Settings.
#[tauri::command]
fn capture_display(display_id: u32) -> Result<String, String> {
    capture_display_impl(display_id)
}

/// Capture the display the controller window is currently positioned on.
/// This is the default capture path (auto mode in Settings).
///
/// Uses Tauri's current_monitor() to find the window's physical monitor
/// dimensions, then matches to a scap display target by comparing those
/// dimensions against scap_frame_size (physical pixels). Falls back to
/// the primary display if no match is found.
#[tauri::command]
async fn capture_controller_display(app: tauri::AppHandle) -> Result<String, String> {
    let perm = scap::has_permission();
    log::info!("capture_controller_display: entry has_permission={perm}");
    if !perm {
        log::warn!("capture_controller_display: permission denied — returning error");
        return Err("screen_recording_permission_denied".to_string());
    }
    use tauri::Manager;

    let targets = scap::get_all_targets();

    let display_id: u32 = {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Main window not found".to_string())?;

        let monitor_opt = window.current_monitor().map_err(|e| e.to_string())?;

        match monitor_opt {
            None => {
                log::warn!("capture_controller_display: no current monitor, using primary");
                scap::get_main_display().id
            }
            Some(monitor) => {
                let mon_w = monitor.size().width;
                let mon_h = monitor.size().height;
                log::info!(
                    "capture_controller_display: current monitor physical={mon_w}x{mon_h}"
                );

                // Match scap display by physical dimensions.
                // scap_frame_size with Resolution::Captured returns physical pixels
                // (logical × scale_factor), matching Tauri's monitor.size() values.
                let matched = targets.iter().find(|t| {
                    if let scap::Target::Display(_) = t {
                        let opts = ScapOptions {
                            fps: 1,
                            target: Some((*t).clone()),
                            output_resolution: Resolution::Captured,
                            ..Default::default()
                        };
                        let [w, h] = scap_frame_size(&opts);
                        w == mon_w && h == mon_h
                    } else {
                        false
                    }
                });

                match matched {
                    Some(scap::Target::Display(d)) => {
                        log::info!(
                            "capture_controller_display: matched display id={}",
                            d.id
                        );
                        d.id
                    }
                    _ => {
                        log::warn!(
                            "capture_controller_display: no display match, falling back to primary"
                        );
                        scap::get_main_display().id
                    }
                }
            }
        }
    };

    log::info!("capture_controller_display: delegating to capture_display_impl display_id={display_id}");
    capture_display_impl(display_id)
}

/// Check (and request) screen recording permission.
///
/// On macOS: calls scap::has_permission(). If not already granted, calls
/// scap::request_permission() which triggers the OS permission dialog on
/// first call. Returns "granted" or "denied".
/// On other platforms: always returns "granted" (scap::has_permission()
/// returns true unconditionally on Windows).
#[tauri::command]
fn check_screen_recording_permission() -> String {
    let perm = scap::has_permission();
    log::info!("check_screen_recording_permission: entry has_permission={perm}");
    if perm {
        log::info!("check_screen_recording_permission: already granted, returning 'granted'");
        return "granted".to_string();
    }
    log::info!("check_screen_recording_permission: calling scap::request_permission()");
    // Trigger the OS permission dialog; returns whether permission was granted.
    let granted = scap::request_permission();
    log::info!("check_screen_recording_permission: request_permission() returned {granted}");
    if granted {
        "granted".to_string()
    } else {
        "denied".to_string()
    }
}

/// Open macOS System Settings directly to the Screen Recording privacy page.
/// No-op on non-macOS platforms.
#[tauri::command]
fn open_screen_recording_settings() -> Result<(), String> {
    log::info!("open_screen_recording_settings: entry"); // first line — confirms invocation independent of TCC state
    #[cfg(target_os = "macos")]
    {
        let result = std::process::Command::new("open")
            .arg(
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
            )
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string());
        log::info!("open_screen_recording_settings: spawn result ok={}", result.is_ok());
        result
    }
    #[cfg(not(target_os = "macos"))]
    {
        log::info!("open_screen_recording_settings: non-macOS no-op");
        Ok(())
    }
}

/// Quit the application immediately.
///
/// app.exit(0) is built into tauri::AppHandle in Tauri v2 core — no
/// separate plugin is required.
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    log::info!("quit_app: exiting application at user request");
    app.exit(0);
}

/// Restart the application — spawns a fresh instance and exits the current one.
///
/// Used by the "Quit and Reopen Smidgeon" button in the screen recording
/// permission recovery UI. macOS screen recording permission grants never
/// apply to the already-running process; a restart is always required.
///
/// app.restart() is built into tauri::AppHandle in Tauri v2 core — no
/// separate plugin is required.
#[tauri::command]
fn relaunch_app(app: tauri::AppHandle) {
    log::info!("relaunch_app: restarting application at user request");
    app.restart();
}

/// Returns whether the current platform and OS version support screenshot capture.
///
/// On macOS, requires macOS 14.0+ (Sonoma). scap's ScreenCaptureKit backend
/// requires macOS 14+ for the single-frame capture path used here.
///
/// On Windows, always returns true — Windows.Graphics.Capture (scap's Windows
/// backend) requires Windows 10 v1803+ which is a universally-met baseline.
///
/// Frontend uses this to show an inline message instead of the Screenshots
/// toggle on unsupported OS versions.
#[tauri::command]
fn supports_screenshot_capture() -> bool {
    #[cfg(not(target_os = "macos"))]
    return true;

    #[cfg(target_os = "macos")]
    {
        let output = match std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output()
        {
            Ok(o) => o,
            Err(e) => {
                log::error!("supports_screenshot_capture: sw_vers failed: {e}");
                return false;
            }
        };
        let version = String::from_utf8_lossy(&output.stdout);
        let major: u32 = version
            .trim()
            .split('.')
            .next()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        log::info!("supports_screenshot_capture: macOS major version={major}");
        major >= 14
    }
}

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use log::LevelFilter;
    use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

    // Use Debug level in dev builds, Info in release.
    let log_level = if cfg!(debug_assertions) {
        LevelFilter::Debug
    } else {
        LevelFilter::Info
    };

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log_level)
                // Keep the 5 most recent log files; rotate when a file reaches 5 MB.
                .rotation_strategy(RotationStrategy::KeepSome(5))
                .max_file_size(5 * 1024 * 1024)
                // Write to both the OS-specific log directory and stdout so
                // `cargo tauri dev` terminal output is preserved alongside file logging.
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_oauth::init())
        .invoke_handler(tauri::generate_handler![
            start_oauth,
            list_displays,
            capture_display,
            capture_controller_display,
            check_screen_recording_permission,
            open_screen_recording_settings,
            supports_screenshot_capture,
            relaunch_app,
            quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
