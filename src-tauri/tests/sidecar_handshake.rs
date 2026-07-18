//! Proves the sidecar handshake without a GUI: spawn the actual SEA binary
//! the way the shell will (same file Tauri bundles via externalBin) and check
//! it answers `version` with well-formed JSON. Runs in plain `cargo test`.
//!
//! If the sidecar hasn't been built on this machine (`npm run sidecar`), the
//! test SKIPS with a message instead of failing — CI builds the Rust crate
//! without the 137MB artifact for now; the full matrix lands in Phase 4.

use std::path::PathBuf;
use std::process::Command;

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
const TRIPLE: &str = "aarch64-apple-darwin";
#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
const TRIPLE: &str = "x86_64-apple-darwin";
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const TRIPLE: &str = "x86_64-unknown-linux-gnu";
#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
const TRIPLE: &str = "aarch64-unknown-linux-gnu";

#[test]
fn sidecar_answers_the_version_handshake_with_json() {
    let sidecar: PathBuf = [env!("CARGO_MANIFEST_DIR"), "..", "dist-sidecar", &format!("sutra-engine-{TRIPLE}")]
        .iter()
        .collect();

    if !sidecar.exists() {
        eprintln!("SKIP: sidecar not built at {} — run `npm run sidecar` first.", sidecar.display());
        return;
    }

    let out = Command::new(&sidecar).arg("version").output().expect("sidecar failed to spawn");
    assert!(out.status.success(), "version handshake exited {:?}", out.status.code());

    let stdout = String::from_utf8_lossy(&out.stdout);
    let parsed: serde_json::Value = serde_json::from_str(stdout.trim()).expect("version output was not JSON");
    assert!(parsed["engine"].is_string(), "missing engine field in {parsed}");
    assert!(parsed["node"].is_string(), "missing node field in {parsed}");
}
