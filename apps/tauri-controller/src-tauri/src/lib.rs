use tauri::Emitter;
use screenshots::Screen;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use std::io::Cursor;

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
// Core capture implementation
//
// ROOT CAUSE NOTE:
//   The screenshots crate's macOS backend uses CGWindowListCreateImage via
//   CGDisplay::screenshot(kCGWindowListOptionOnScreenOnly, ...). This is a
//   window-compositor capture that assembles only app-level windows and
//   intentionally omits system UI layers (menu bar, Dock) which are rendered
//   by separate processes at privileged window levels. Other apps' windows
//   are also excluded unless Screen Recording permission is fully active.
//
//   The fix is to call CGDisplayCreateImage (CGDisplay::image()) instead,
//   which reads the complete hardware framebuffer and always captures
//   everything visible — menu bar, Dock, all app windows, wallpaper.
//   This is the same API used by macOS's built-in Command-Shift-3 screenshot.
//
// FUTURE MIGRATION NOTE:
//   The intent was to replace this with the `scap` crate (ScreenCaptureKit
//   on macOS, Windows.Graphics.Capture on Windows) for a single cross-platform
//   capture path. However, scap's macOS backend (`cidre`) calls `xcodebuild`
//   from its build.rs and requires full Xcode — not just Command Line Tools.
//   Until the build machine has full Xcode installed, the CGDisplayCreateImage
//   path below is the correct macOS fix, and the screenshots crate continues
//   to handle Windows/Linux captures.
//
//   When Xcode is available, replace this file with the scap implementation
//   (Cargo.toml: remove screenshots + core-graphics, add scap = "0.1.0-beta.1").
// ---------------------------------------------------------------------------

/// macOS path: use CGDisplayCreateImage — true framebuffer capture.
#[cfg(target_os = "macos")]
fn capture_display_impl(display_id: u32) -> Result<String, String> {
    use core_graphics::display::CGDisplay;

    let cg_display = CGDisplay::new(display_id);
    let cg_image = cg_display
        .image()
        .ok_or_else(|| format!("CGDisplayCreateImage failed for display {display_id} \
            (is Screen Recording permission granted?)"))?;

    let width = cg_image.width();
    let height = cg_image.height();
    let bytes_per_row = cg_image.bytes_per_row();
    let raw_data = cg_image.data();
    let bytes = raw_data.bytes();

    eprintln!(
        "[smidgeon] capture_display_impl: display={display_id} \
         raw={width}x{height} bytes_per_row={bytes_per_row} data_len={}",
        bytes.len()
    );

    // CGDisplayCreateImage returns BGRA8888. There may be padding at the end
    // of each row (bytes_per_row > width * 4). Strip it and convert BGRA→RGBA.
    let pixel_stride = width * 4;
    let rgba_buf: Vec<u8> = if bytes_per_row == pixel_stride {
        let mut buf = bytes.to_vec();
        for pixel in buf.chunks_exact_mut(4) {
            pixel.swap(0, 2); // B↔R
        }
        buf
    } else {
        let mut buf = Vec::with_capacity(pixel_stride * height);
        for row in bytes.chunks_exact(bytes_per_row) {
            buf.extend_from_slice(&row[..pixel_stride]);
        }
        for pixel in buf.chunks_exact_mut(4) {
            pixel.swap(0, 2); // B↔R
        }
        buf
    };

    let img_buf = image::ImageBuffer::<image::Rgba<u8>, Vec<u8>>::from_raw(
        width as u32,
        height as u32,
        rgba_buf,
    )
    .ok_or_else(|| "Failed to create RGBA image buffer".to_string())?;

    let dynamic_img = image::DynamicImage::ImageRgba8(img_buf);
    let mut jpeg_bytes = Vec::<u8>::new();
    dynamic_img
        .write_to(&mut Cursor::new(&mut jpeg_bytes), image::ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;

    eprintln!(
        "[smidgeon] capture_display_impl: JPEG size={} bytes",
        jpeg_bytes.len()
    );

    Ok(STANDARD.encode(&jpeg_bytes))
}

/// Non-macOS path: use the screenshots crate (CGWindowListCreateImage is fine
/// on Windows/Linux where there are no system-layer exclusions).
#[cfg(not(target_os = "macos"))]
fn capture_display_impl(display_id: u32) -> Result<String, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens
        .iter()
        .find(|s| s.display_info.id == display_id)
        .ok_or_else(|| format!("Display {display_id} not found"))?;

    let captured = screen.capture().map_err(|e| e.to_string())?;

    let width = captured.width();
    let height = captured.height();
    let raw_pixels: Vec<u8> = captured.into_raw();

    let img_buf =
        image::ImageBuffer::<image::Rgba<u8>, Vec<u8>>::from_raw(width, height, raw_pixels)
            .ok_or_else(|| "Failed to create image buffer from raw pixels".to_string())?;

    let dynamic_img = image::DynamicImage::ImageRgba8(img_buf);
    let mut jpeg_bytes = Vec::<u8>::new();
    dynamic_img
        .write_to(&mut Cursor::new(&mut jpeg_bytes), image::ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;

    Ok(STANDARD.encode(&jpeg_bytes))
}

// ---------------------------------------------------------------------------
// Screenshot commands
// ---------------------------------------------------------------------------

/// Return metadata for all connected displays.
#[tauri::command]
fn list_displays() -> Result<Vec<DisplayInfo>, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    Ok(screens
        .iter()
        .map(|s| DisplayInfo {
            id: s.display_info.id,
            x: s.display_info.x,
            y: s.display_info.y,
            width: s.display_info.width,
            height: s.display_info.height,
            scale_factor: s.display_info.scale_factor,
            is_primary: s.display_info.is_primary,
        })
        .collect())
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
/// Uses Tauri's current_monitor() to find the window's monitor, then matches
/// it to a display_info entry by comparing physical dimensions (physical =
/// logical × scale_factor). Falls back to the first available display.
#[tauri::command]
async fn capture_controller_display(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;

    let screens = Screen::all().map_err(|e| e.to_string())?;

    let display_id: u32 = {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Main window not found".to_string())?;

        // current_monitor() returns the monitor the window centre falls on.
        let monitor_opt = window.current_monitor().map_err(|e| e.to_string())?;

        match monitor_opt {
            None => {
                eprintln!("[smidgeon] capture_controller_display: no current monitor, using first display");
                screens.first().map(|s| s.display_info.id).unwrap_or(0)
            }
            Some(monitor) => {
                let mon_w = monitor.size().width;
                let mon_h = monitor.size().height;
                eprintln!(
                    "[smidgeon] capture_controller_display: current monitor physical size={mon_w}x{mon_h}"
                );

                // Match by physical size. display_info widths are in logical points;
                // physical = logical × scale_factor.
                screens
                    .iter()
                    .find(|s| {
                        let info = &s.display_info;
                        let sf = info.scale_factor as f64;
                        let phys_w = (info.width as f64 * sf).round() as u32;
                        let phys_h = (info.height as f64 * sf).round() as u32;
                        phys_w == mon_w && phys_h == mon_h
                    })
                    .or_else(|| screens.first())
                    .map(|s| {
                        eprintln!(
                            "[smidgeon] capture_controller_display: matched display id={}",
                            s.display_info.id
                        );
                        s.display_info.id
                    })
                    .unwrap_or(0)
            }
        }
    };

    capture_display_impl(display_id)
}

/// Probe screen recording permission by attempting a real capture.
///
/// On macOS uses CGDisplayCreateImage (same path as the real capture).
/// The first call triggers the system permission dialog if not yet shown.
/// Returns "granted", "denied", or "not_determined".
/// Always returns "granted" on non-macOS platforms.
#[tauri::command]
fn check_screen_recording_permission() -> String {
    #[cfg(not(target_os = "macos"))]
    return "granted".to_string();

    #[cfg(target_os = "macos")]
    {
        use core_graphics::display::CGDisplay;
        let screens = match Screen::all() {
            Err(e) => {
                eprintln!("check_screen_recording_permission: Screen::all() failed: {e}");
                return "denied".to_string();
            }
            Ok(s) => s,
        };
        let first = match screens.first() {
            None => return "not_determined".to_string(),
            Some(s) => s,
        };
        let cg_display = CGDisplay::new(first.display_info.id);
        match cg_display.image() {
            Some(_) => "granted".to_string(),
            None => {
                eprintln!("check_screen_recording_permission: CGDisplayCreateImage returned None");
                "denied".to_string()
            }
        }
    }
}

/// Open macOS System Settings directly to the Screen Recording privacy page.
/// No-op on non-macOS platforms.
#[tauri::command]
fn open_screen_recording_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
            )
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

/// Returns whether the current platform and OS version support screenshot capture.
///
/// On macOS, requires macOS 14.0+ (Sonoma). The CGDisplayCreateImage API
/// (our current macOS capture path) works on older versions, but ScreenCaptureKit
/// single-frame capture — the intended long-term backend — requires macOS 14+.
/// Using 14+ as the floor future-proofs the setting for the eventual scap migration.
///
/// On Windows, always returns true (no equivalent version constraint for the
/// screenshots crate's Windows capture path; Windows.Graphics.Capture, the
/// future scap backend, requires Windows 10 v1803+ which is a universally-met
/// baseline).
///
/// Frontend uses this to disable the Screenshots toggle with a clear inline
/// message on unsupported OS versions rather than crashing or silently failing.
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
                eprintln!("[smidgeon] supports_screenshot_capture: sw_vers failed: {e}");
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
        eprintln!("[smidgeon] supports_screenshot_capture: macOS major version={major}");
        major >= 14
    }
}

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
