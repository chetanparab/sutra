//! The Sutra desktop shell (ROADMAP.md Phase 3): a thin Tauri host whose only
//! jobs are to show the existing React UI and manage the engine sidecar — the
//! Node SEA binary built by `engine/scripts/build-sidecar.mjs` (decision
//! record: engine/SIDECAR.md). All product logic stays in the engine and the
//! webview; this crate is wiring, deliberately.

use tauri_plugin_shell::ShellExt;

/// The handshake: spawn the sidecar, ask it who it is, hand the webview the
/// JSON. Proves the whole chain — bundled binary resolved by target triple,
/// spawn permitted, stdout captured — before any real loop traffic rides it.
#[tauri::command]
async fn engine_version(app: tauri::AppHandle) -> Result<String, String> {
    let output = app
        .shell()
        .sidecar("sutra-engine")
        .map_err(|e| format!("sidecar not found (build it: npm run sidecar): {e}"))?
        .arg("version")
        .output()
        .await
        .map_err(|e| format!("sidecar failed to spawn: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "engine version handshake exited {:?}: {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![engine_version])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
