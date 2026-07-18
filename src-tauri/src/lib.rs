//! The Sutra desktop shell (ROADMAP.md Phase 3): a thin Tauri host whose only
//! jobs are to show the existing React UI and manage the engine sidecar — the
//! Node SEA binary built by `engine/scripts/build-sidecar.mjs` (decision
//! record: engine/SIDECAR.md). All product logic stays in the engine and the
//! webview; this crate is wiring, deliberately.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// The one loop the shell will run at a time. Holding the child here is what
/// makes the kill switch real: abort can always reach the process.
struct RunningLoop(Mutex<Option<CommandChild>>);

/// Everything the webview must supply to launch a real run. Mirrors the CLI
/// flags one-to-one — the shell adds no policy of its own. Two fields carry
/// the frozen invariants: `verify_cmd` is the USER's command typed in the
/// consent surface (the model never authors it), and `consent_to_run` must be
/// true or the engine itself refuses.
#[derive(serde::Deserialize)]
pub struct LoopArgs {
    workspace_path: String,
    intent: String,
    provider: String,
    model: String,
    verify_cmd: String,
    consent_to_run: bool,
    max_iterations: u8,
    reflect_model: Option<String>,
}

/// Spawn the engine sidecar in `--events ndjson` mode and forward its stream
/// to the webview as Tauri events: `engine:line` (one NDJSON object per
/// payload), `engine:log` (stderr narration), `engine:exit` (code). The
/// webview owns parsing; the host stays a dumb, auditable pipe.
#[tauri::command]
async fn loop_start(app: AppHandle, state: State<'_, RunningLoop>, args: LoopArgs) -> Result<(), String> {
    if !args.consent_to_run {
        return Err("consent_to_run must be explicitly true — the loop executes your verify command.".into());
    }
    {
        let guard = state.0.lock().unwrap();
        if guard.is_some() {
            return Err("a loop is already running — abort it first.".into());
        }
    }

    let mut cmd = app
        .shell()
        .sidecar("sutra-engine")
        .map_err(|e| format!("sidecar not found (build it: npm run sidecar): {e}"))?
        .args([
            "loop",
            &args.workspace_path,
            &args.intent,
            "--provider",
            &args.provider,
            "--model",
            &args.model,
            "--verify-cmd",
            &args.verify_cmd,
            "--allow-run",
            "true",
            "--max-iterations",
            &args.max_iterations.to_string(),
            "--events",
            "ndjson",
        ]);
    if let Some(reflect_model) = &args.reflect_model {
        cmd = cmd.args(["--reflect-model", reflect_model]);
    }

    let (mut rx, child) = cmd.spawn().map_err(|e| format!("engine failed to spawn: {e}"))?;
    *state.0.lock().unwrap() = Some(child);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let _ = app.emit("engine:line", String::from_utf8_lossy(&line).trim().to_string());
                }
                CommandEvent::Stderr(line) => {
                    let _ = app.emit("engine:log", String::from_utf8_lossy(&line).trim().to_string());
                }
                CommandEvent::Terminated(payload) => {
                    app.state::<RunningLoop>().0.lock().unwrap().take();
                    let _ = app.emit("engine:exit", payload.code);
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// The kill switch. "abort" over stdin triggers the engine's clean-rollback
/// path (same as Ctrl+C: the current iteration rolls back, completed
/// iterations stay) — portable to every platform, unlike signals.
#[tauri::command]
fn loop_abort(state: State<'_, RunningLoop>) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    match guard.as_mut() {
        Some(child) => child.write(b"abort\n").map_err(|e| format!("could not reach the engine: {e}")),
        None => Err("no loop is running.".into()),
    }
}

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
        .manage(RunningLoop(Mutex::new(None)))
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
        .invoke_handler(tauri::generate_handler![engine_version, loop_start, loop_abort])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
