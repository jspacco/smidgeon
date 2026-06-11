use tauri::Emitter;

#[tauri::command]
async fn start_oauth(window: tauri::Window) -> Result<u16, String> {
    tauri_plugin_oauth::start(move |url| {
        let _ = window.emit("oauth-callback", url);
    })
    .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_oauth::init())
        .invoke_handler(tauri::generate_handler![start_oauth])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
