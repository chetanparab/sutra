<div align="center">

# Sutra

### The loop-engineering IDE

**Software, engineered as a loop.** Declare the outcome — a crew of agents cycles
**Sense → Build → Verify → Reflect** until every acceptance signal is green,
_measured in a WebAssembly sandbox, not promised._

[![CI](https://github.com/chetanparab/sutra/actions/workflows/ci.yml/badge.svg)](https://github.com/chetanparab/sutra/actions/workflows/ci.yml)
[![CodeQL](https://github.com/chetanparab/sutra/actions/workflows/codeql.yml/badge.svg)](https://github.com/chetanparab/sutra/actions/workflows/codeql.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

</div>

---

Prompts hope. Specs freeze. **Loops converge.** Sutra is a concept preview of an
IDE built around convergence instead of keystrokes: you design a loop — its
autonomy, its human gates, its iteration budget — and a crew of agents iterates
against live context until the change is provably done.

> ⚠️ **Concept preview.** The demo mission and the agent crew are a scripted
> scenario. The **verification is real**: the retry code genuinely executes in a
> QuickJS-on-WebAssembly sandbox in your browser, and the numbers you see are
> measured from that run.

## Highlights

- **Living code surface** — watch Builder A & B write the executor with presence
  cursors; hot lines get flagged over budget and the fix lands as a live diff morph.
- **Real WASM verification** — Verify doesn't claim, it runs: 1,000 replays,
  0 duplicate charges, p99 measured — sandboxed, offline, identical on every OS.
- **Loop designer** — autonomy (copilot · guided · autopilot), human gates, an
  iteration budget with extend-or-accept decisions at the wall.
- **Convergence orbit**, **Hermes memos**, **flight recorder**, **⌘K Conductor**,
  **context plane**, **review surface**, and a **governance gate**.
- **Five design languages** (Luminous · Editorial · Tactile · Ink · Cinematic),
  driven by one runtime token system.
- **Open runtime** — flows are config, acceptance signals are the universal
  contract, and any agent that speaks MCP or HTTP can join the crew. Adapters
  read GitHub Spec Kit / Kiro artifacts as-is.

## Try it

**Web:** open the app — the full engine, including the WASM sandbox, runs in your
browser. Nothing to install.

**Desktop:** native builds (a ~10 MB Tauri shell over the same codebase) are
published on the [Releases](https://github.com/chetanparab/sutra/releases) page as
they roll out for macOS, Windows and Linux.

## Run locally

```bash
npm install
npm run dev        # → http://localhost:5183  (site at /, IDE at /app.html)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

Requires Node 20+.

## Architecture

- **Two pages, one codebase** — `index.html` is the product site (`src/site/`),
  `app.html` is the IDE (`src/`). Vite builds both.
- **Featherweight shell** — the desktop app is a Tauri wrapper over the OS's
  native webview; no bundled browser.
- **WebAssembly engine** — verification runs in a sandboxed QuickJS VM
  (`src/wasm/`): byte-identical on every OS, fully offline, and agent-generated
  code never touches your system directly.

## Contributing

Contributions are welcome — please read [CONTRIBUTING.md](./CONTRIBUTING.md) and
our [Code of Conduct](./CODE_OF_CONDUCT.md). All changes go through a pull request
with passing CI and review.

## Security

Please report vulnerabilities privately — see [SECURITY.md](./SECURITY.md). Do not
open public issues for security problems.

## License

Licensed under the [Apache License 2.0](./LICENSE). See [NOTICE](./NOTICE) and
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for attributions.

**The "Sutra" name and logo are trademarks** and are not covered by the code
license (Apache-2.0 grants no trademark rights). You may build on the code; please
don't ship forks under the Sutra name or brand.

<div align="center">
<sub>© 2026 Chetan Parab · Built as part of the Analogy Architect toolset.</sub>
</div>
