# Security-review pass — pre-`v2.0.0` (ROADMAP.md Phase 4, issue #43)

A written audit of the security-critical surfaces accumulated across Phases
0–4, checked off before the `v2.0.0` tag. Companion to
[`SECURITY.md`](SECURITY.md) (the untrusted-repo threat model); this document
is the point-in-time sign-off.

Reviewed at commit: the merge of the Phase 4 hardening work. Re-run this pass
if any file below changes before the tag.

## Checklist

### ☑︎ API-key handling
- Keys reach the engine as a **child-process environment variable only** —
  never argv (would show in process listings), never plaintext disk, never
  logs. Verified by grep: no `apiKey`/`ANTHROPIC_API_KEY`/`OPENAI_API_KEY` flows
  into `console.*`, `println!`, `eprintln!`, `.args([…])`, or argv anywhere.
- The desktop shell stores keys in the **OS keychain** (`keyring` crate with
  native stores feature-selected — the mock-store trap is called out in
  `Cargo.toml`). The webview can only ask *is one saved?* / *save* / *forget*;
  **no command returns a stored secret**. Only `loop_start` reads it, host-side,
  into the child env.
- The engine's stderr (forwarded to the webview as `engine:log`) never prints a
  key; the "not set" errors name the variable, never a value.

### ☑︎ Workspace escapes
- Every fs-tool path goes through `resolveInWorkspace` (`tools/workspace.ts`):
  rejects textual `../` traversal, absolute paths, and — via `realpathSync` —
  symlinks that resolve outside the root, with the **root itself realpath'd** so
  a symlinked root (e.g. macOS `/tmp`→`/private/tmp`) doesn't cause false
  rejects.
- `O_NOFOLLOW` at the actual `open()` (`tools/fs.ts`) closes the check-to-open
  TOCTOU/symlink-swap gap that a path-string check alone cannot.
- Re-audited against traversal, absolute, and symlink cases; the hostile-repo
  regression (`security/injection.test.ts`) drives all three with an obedient
  model and they are refused.

### ☑︎ Command injection via test/lint config
- The verify command is **user-authored only** — a CLI flag / consent-surface
  field; the model has no tool that sets or alters it. Editing a repo file
  cannot change which command runs.
- `shell: true` appears in exactly one place (`verify/runner.ts`), gated by
  `consentToRun` (literal-`true` type + runtime check). This is the deliberate,
  documented execution boundary, not an injection surface.
- The Rust host passes `workspace_path` / `intent` / `verify_cmd` to the sidecar
  as an **argv array** (`tauri-plugin-shell` `.args([…])`), never a shell
  string — so none of them can inject a second command.

### ☑︎ Human-gated merge / no auto-merge
- The loop commits only to a generated shadow branch; `merge_branch` runs only
  from the explicit user click, and nothing in the engine calls it. Proven
  byte-for-byte in the injection regression (main untouched by a compromised
  run).

### ☑︎ Prompt-injection boundaries
- The hostile-repo fixture + regression run in `npm test` (and CI, issue #41):
  escape reads refused, no shell tool to reach, in-workspace-only edits,
  shadow-branch-only commits, user-authored verify. Threat model documented in
  `SECURITY.md`.

### ☑︎ Least-privilege webview
- Tauri capabilities are `core:default` + `dialog:allow-open` only. The webview
  has **no shell/exec capability**; every privileged action goes through a
  typed Rust command with its own checks.

### ☑︎ Supply chain
- The SEA sidecar's donor node binary is **verified against nodejs.org's
  `SHASUMS256.txt`** for the exact release before it is unpacked or executed
  (`build-sidecar.mjs`) — a tampered mirror/MITM is caught before the binary
  the whole engine is built on ever runs.
- Installer signing + notarization is wired in the release workflow, gated on
  user-provided certs (issue #42) — the final integrity layer for end users.

### ☑︎ Static analysis
- CodeQL: `js/insecure-temporary-file` @ `fs.ts` is a **documented false
  positive** (taint source is only the module's own `mkdtempSync` test
  fixtures; the real risk is closed by `O_NOFOLLOW`), dismissed with reasoning
  in the Security tab. `js/http-to-file-access` @ `build-sidecar.mjs` is
  **mitigated** by the SHASUMS256 verification above (the downloaded bytes are
  integrity-checked before any use).

## Findings fixed during this pass

- **`loop_start` launch race (fixed).** The "a loop is already running" check
  and the child-handle store were separated by a released lock — two racing
  `loop_start` calls could both spawn, leaking the first child so the kill
  switch (`loop_abort`) could never reach it. Not reachable through the UI (the
  launch button is disabled during a run), but a real gap in the kill-switch
  guarantee. Now the check, spawn, and store all happen under one held lock.

## Residual risks (accepted, documented)

- **Consent is the execution trust boundary.** A consented verify command — and
  any code the loop just wrote — runs on the user's machine; file access is
  workspace-constrained but the command itself is not sandboxed. A
  container/cloud Verify adapter (issue #10) is the future mitigation. The
  consent surface states this plainly.
- **The model can still write bad code** into the workspace; Review (a human
  reading the real diff) is the control, and merge is human-gated.
- **In-workspace secrets are readable** by design — the boundary is the
  workspace root, not content classification.
