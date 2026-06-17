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

/// Capture a display and return a base64-encoded JPEG string (~80% quality).
///
/// The screenshots crate re-exports image 0.24 internally. We extract the raw
/// RGBA pixel bytes from its ImageBuffer and reconstruct them in our image 0.25
/// dependency, then write as JPEG. A typical 1920×1080 slide capture comes out
/// under 300 KB at the image crate's default JPEG quality.
///
/// On macOS, the very first call triggers the system Screen Recording
/// permission dialog if it hasn't been shown before.
#[tauri::command]
fn capture_display(display_id: u32) -> Result<String, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens
        .iter()
        .find(|s| s.display_info.id == display_id)
        .ok_or_else(|| format!("Display {} not found", display_id))?;

    let captured = screen.capture().map_err(|e| e.to_string())?;

    // Bridge from screenshots' image 0.24 ImageBuffer → our image 0.25 ImageBuffer
    // by extracting the raw RGBA bytes.
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

/// Probe screen recording permission by attempting a test capture.
///
/// Returns "granted", "denied", or "not_determined" (no screens found).
/// On macOS this is the only way to check: attempting any capture for the
/// first time triggers the system permission dialog.
/// On non-macOS platforms always returns "granted".
#[tauri::command]
fn check_screen_recording_permission() -> String {
    #[cfg(not(target_os = "macos"))]
    return "granted".to_string();

    #[cfg(target_os = "macos")]
    {
        match Screen::all() {
            Err(e) => {
                eprintln!("check_screen_recording_permission: Screen::all() failed: {e}");
                return "denied".to_string();
            }
            Ok(screens) => {
                match screens.into_iter().next() {
                    None => return "not_determined".to_string(),
                    Some(screen) => match screen.capture() {
                        Ok(_) => return "granted".to_string(),
                        Err(e) => {
                            eprintln!(
                                "check_screen_recording_permission: capture failed: {e}"
                            );
                            return "denied".to_string();
                        }
                    },
                }
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
            check_screen_recording_permission,
            open_screen_recording_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
