# Changelog

All notable changes to Sutra are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

- Path to a signed, notarized `v2.0.0` (needs code-signing certificates).
- Windows installers (the Node SEA sidecar binary needs a Windows-side fix).

## [2.0.0-beta.3] — 2026-07-19

### Fixed

- **The installed desktop app opened the marketing site instead of the IDE.** In
  a production Tauri build the window `url` field is ignored and `index.html`
  loads; the desktop bundle now builds the IDE *as* `index.html`
  (`npm run build:desktop`) so the packaged app opens the real IDE.

## [2.0.0-beta.2] — 2026-07-19

### Added — Phase 5 (post-v2.0 features)

- **Isolated Verify** — run your verify command inside a throwaway Docker
  container (only the workspace mounted, network off) instead of on the host.
- **Bring-your-own-agent (MCP)** — plug in your own Model Context Protocol
  servers; their tools join the Build agent alongside the built-in file tools.
- Both are wired through to the desktop launch panel (an "Advanced" section).

### Changed

- The web experience now honestly presents itself as a **demo** (a badge, and a
  "Get the desktop app" call to action for real runs).

## [2.0.0-beta.1] — 2026-07-19

The first release with a **real engine** — the culmination of roadmap Phases 0–4.

### Added

- **Real Build (BYO-LLM)** — a provider-agnostic tool-use loop driving real,
  structured edits with Anthropic or any OpenAI-compatible model; day-one cost
  ceilings and guardrails.
- **Real Verify + Reflect** — runs your own test command (behind explicit
  consent) and turns failures into a directive for the next iteration.
- **The iteration loop** — Sense → Build → Verify → Reflect on a shadow branch
  until it converges or the budget is spent.
- **Real Merge** — human-gated fast-forward / rebase-then-ff; conflicts and dirty
  worktrees come back as refusals, never a force.
- **Desktop shell** — a Tauri app managing the engine as a sidecar, OS-keychain
  key storage, a workspace picker, consent surface, budget cap and kill switch.
- **Hardening** — error-path coverage (retries, context limits), a standing
  prompt-injection / hostile-repo regression, an engine regression gate in CI,
  autopilot restricted in real mode, and a written security-review pass.

## [1.3.0] — 2026-07-17

- The high-fidelity **concept demo**: the scripted Sense → Build → Verify →
  Reflect mission, the loop designer, the convergence orbit, Hermes memos, the
  flight recorder, the ⌘K Conductor, and five design languages — with a real
  QuickJS-on-WebAssembly verification sandbox for the built-in scenario.

[Unreleased]: https://github.com/chetanparab/sutra/compare/v2.0.0-beta.3...HEAD
[2.0.0-beta.3]: https://github.com/chetanparab/sutra/compare/v2.0.0-beta.2...v2.0.0-beta.3
[2.0.0-beta.2]: https://github.com/chetanparab/sutra/compare/v2.0.0-beta.1...v2.0.0-beta.2
[2.0.0-beta.1]: https://github.com/chetanparab/sutra/compare/v1.3.0...v2.0.0-beta.1
[1.3.0]: https://github.com/chetanparab/sutra/releases/tag/v1.3.0
