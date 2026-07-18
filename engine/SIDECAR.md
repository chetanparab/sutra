# Sidecar packaging — decision record (Phase 3 spike, issue #25)

**Decision: Node SEA (single executable applications).** The engine ships inside
the Tauri app as one self-contained binary built by
[`scripts/build-sidecar.mjs`](scripts/build-sidecar.mjs), named
`sutra-engine-<rust-target-triple>` the way Tauri's `externalBin` expects.

## Options considered

| Option | Verdict |
| --- | --- |
| **Node SEA** | **Chosen.** Stable core-Node feature on the Node 26 we already run; the bundler it needs (esbuild) is already a dependency via Vite; no new runtime or toolchain enters the project. |
| `bun build --compile` | Works, similar output size — but adds a second JS runtime to the project only for packaging, and subtle Node-vs-Bun API differences in `child_process`/`fs` would have to be re-verified across the whole engine. |
| `pkg`-style bundling | vercel/pkg is archived/unmaintained. No. |
| Port the engine's I/O layer to Rust | The roadmap's worst case. Unnecessary — SEA worked on the first real try. |

## What the spike proved

The compiled binary ran the **entire Phase 0 real path** — materialized a
fixture repo, created a shadow branch, applied a structured edit through the
workspace-root guard, committed, printed the diff — with real `git`
subprocesses spawned from inside the SEA. Engine behavior is identical because
it is literally the same code, bundled.

## The sharp edge worth remembering

`brew install node` gives you a **~66KB thin wrapper linking
`libnode.dylib`** — a SEA built from it is not self-contained (and postject
can't inject into it anyway). Only **official nodejs.org dist binaries**
(~140MB, statically plumbed) work. The build script asserts this (any donor
binary under 50MB is rejected with an explanation) and downloads a matching
official binary into `dist-sidecar/.node-cache/` by default; `SUTRA_SEA_NODE`
overrides.

## Build steps (what the script automates)

1. `esbuild engine/src/cli.ts --bundle --platform=node --format=cjs` → one ~40KB CJS file.
2. `node --experimental-sea-config` → SEA preparation blob.
3. Copy an official node binary; on macOS `codesign --remove-signature`.
4. `postject <binary> NODE_SEA_BLOB <blob> --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2` (+ `--macho-segment-name NODE_SEA` on macOS).
5. On macOS, ad-hoc `codesign --sign -` — **real signing/notarization is Phase 4**, deliberately.
6. Smoke test: the binary must complete a real `apply-test-edit` run, not just print `--help`.

Result: ~137MB per platform. Fat for a CLI, normal for a desktop-app sidecar
(Electron ships more), and the roadmap's freeze-approved trade: wiring over
rewrites.

## Platform coverage

All four desktop targets build from `build-sidecar.mjs`, each on its own OS
(SEA injects into a same-platform donor binary — no cross-compilation):

- **macOS** (arm64 + x64): ad-hoc `codesign` for local dev; real
  signing/notarization is the release workflow's job with a user cert.
- **Linux** (x64): plain inject, no signing step.
- **Windows** (x64): `.exe` suffix, no `codesign`/Mach-O segment; the donor is
  the official `win-x64` `.zip` (node.exe at the archive root), unzipped with
  PowerShell. `signtool` signing is the release workflow's job with a user cert.

The release matrix (`.github/workflows/release.yml`) runs this per-OS before
`tauri build` so the sidecar exists for `externalBin` to bundle.

## Still open (deliberately)

- **Cross-compilation**: none, by design — each platform builds its own binary
  on that platform's runner.
