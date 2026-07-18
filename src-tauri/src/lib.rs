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
    /// Freshly-typed API key. Reaches the engine ONLY as an env var on the
    /// child (the frozen day-one posture: never argv, never disk in
    /// plaintext, never logged). None means "use the OS keychain, else
    /// inherit the shell env" — the stored and dev-terminal cases.
    api_key: Option<String>,
    /// When a fresh key is supplied: save it to the OS keychain for next
    /// time. The UI's "remember" checkbox.
    store_key: Option<bool>,
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
    // Key resolution: freshly typed > OS keychain > inherited shell env.
    // Env on the child only — never argv (visible in process lists), never
    // plaintext disk, never logs. Which variable depends on the provider.
    let var = match args.provider.as_str() {
        "anthropic" => "ANTHROPIC_API_KEY",
        "openai-compat" => "OPENAI_API_KEY",
        other => return Err(format!("unknown provider \"{other}\"")),
    };
    if let Some(key) = args.api_key.as_deref().map(str::trim).filter(|k| !k.is_empty()) {
        if args.store_key.unwrap_or(false) {
            keychain_entry(&args.provider)?
                .set_password(key)
                .map_err(|e| format!("could not save the key to the OS keychain: {e}"))?;
        }
        cmd = cmd.env(var, key);
    } else if let Ok(stored) = keychain_entry(&args.provider)?.get_password() {
        cmd = cmd.env(var, stored);
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

/// One keychain entry per provider, owned by the app identifier. The webview
/// NEVER reads a stored key back — these commands answer "is one saved?" and
/// "forget it"; only `loop_start` (host-side) ever touches the secret itself,
/// pulling it straight from the OS store into the child's env.
fn keychain_entry(provider: &str) -> Result<keyring::Entry, String> {
    match provider {
        "anthropic" | "openai-compat" => keyring::Entry::new("app.sutra.desktop", &format!("api-key-{provider}"))
            .map_err(|e| format!("keychain unavailable: {e}")),
        other => Err(format!("unknown provider \"{other}\"")),
    }
}

#[tauri::command]
fn keychain_status(provider: String) -> Result<bool, String> {
    match keychain_entry(&provider)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(format!("keychain read failed: {e}")),
    }
}

#[tauri::command]
fn keychain_delete(provider: String) -> Result<(), String> {
    match keychain_entry(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keychain delete failed: {e}")),
    }
}

#[derive(serde::Deserialize)]
pub struct MergeArgs {
    workspace_path: String,
    branch_name: String,
    target_branch: String,
}

#[derive(serde::Serialize)]
pub struct MergeOutcome {
    ok: bool,
    message: String,
}

/// The "Merge to main" click, made real: runs the engine's merge command
/// (fast-forward, or rebase-then-ff; conflicts and dirty worktrees come back
/// as clean refusals). This command executes ONLY when the user clicks the
/// merge button — the human gate is the caller, and nothing else calls it.
#[tauri::command]
async fn merge_branch(app: AppHandle, args: MergeArgs) -> Result<MergeOutcome, String> {
    let output = app
        .shell()
        .sidecar("sutra-engine")
        .map_err(|e| format!("sidecar not found (build it: npm run sidecar): {e}"))?
        .args(["merge", &args.workspace_path, &args.branch_name, "--into", &args.target_branch])
        .output()
        .await
        .map_err(|e| format!("engine failed to spawn: {e}"))?;

    let mut message = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        if !message.is_empty() {
            message.push('\n');
        }
        message.push_str(&stderr);
    }
    Ok(MergeOutcome { ok: output.status.success(), message })
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
        .plugin(tauri_plugin_dialog::init())
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
        .invoke_handler(tauri::generate_handler![
            engine_version,
            loop_start,
            loop_abort,
            merge_branch,
            keychain_status,
            keychain_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
