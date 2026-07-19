<div align="center">

# Sutra

### The loop-engineering IDE

**Software, engineered as a loop.** Point it at a real repo, describe a change,
and a real **Sense → Build → Verify → Reflect** loop iterates — with your own
LLM — until your tests actually pass, then hands you a branch to review and
merge. You conduct; the loop converges.

[![CI](https://github.com/chetanparab/sutra/actions/workflows/ci.yml/badge.svg)](https://github.com/chetanparab/sutra/actions/workflows/ci.yml)
[![CodeQL](https://github.com/chetanparab/sutra/actions/workflows/codeql.yml/badge.svg)](https://github.com/chetanparab/sutra/actions/workflows/codeql.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/chetanparab/sutra?include_prereleases&sort=semver)](https://github.com/chetanparab/sutra/releases)

</div>

---

Prompts hope. Specs freeze. **Loops converge.** Most AI coding tools take one
shot at your prompt and hand you a diff to babysit. Sutra runs a designed
*loop* instead: it edits real files on a throwaway branch, **actually runs your
test command**, reads the failure, tries again, and repeats until the change is
provably done or the budget runs out — never touching your branch until you
click merge.

## Desktop is the product. Web is a live demo.

- **🖥️ Desktop app** — the real thing. Your repo, your model, your test command.
  Runs a real loop end to end. **[Download for macOS / Linux →](https://github.com/chetanparab/sutra/releases)**
- **🌐 Web demo** — a scripted, in-browser preview of one built-in scenario so
  you can *see* the loop converge (`npm run dev`, or the deployed build linked
  from this repo's homepage). It can't run your repo: the real engine needs your
  files, git and tests running on your machine, not in a browser tab. Great for a
  first look; download the app for real work.

## What makes it different

- **A real loop, not one shot** — Build → commit → **run your verify command** →
  Reflect on the failure → iterate, until it passes or the iteration budget is
  spent. Failures carry information into the next pass (a "Hermes memo").
- **Bring your own LLM** — Anthropic or any OpenAI-compatible endpoint (OpenAI,
  Groq, Ollama, …). Your key lives in your OS keychain, reaches the engine as an
  environment variable only — never argv, never plaintext on disk, never logged.
- **Verify for real, optionally isolated** — Verify runs *your* command (the one
  you'd run yourself; the model can never author it). Run it locally, or **inside
  a throwaway Docker container** with only the workspace mounted and the network
  off, for repos you don't fully trust.
- **Bring your own agent (MCP)** — plug in your own Model Context Protocol
  servers; their tools join the Build agent alongside the built-in file tools.
- **Safe by construction** — the loop works on a generated *shadow branch* and
  never merges automatically; the fs tools are constrained to the folder you
  pick (traversal- and symlink-checked); a hostile-repo prompt-injection
  regression runs on every change. See [SECURITY.md](./engine/SECURITY.md).
- **You stay in control** — an explicit consent step before any command runs, a
  cost ceiling and live spend, a kill switch that rolls back cleanly, and a
  human-gated merge (fast-forward or rebase-then-ff; conflicts come back as a
  refusal, never a force).

## Get it

**Desktop (recommended):** grab the installer for your OS from the
[Releases](https://github.com/chetanparab/sutra/releases) page. First run walks
you through picking a model, adding your key, and choosing a repo.

> Builds are **not yet code-signed** (a beta). macOS: right-click → Open the
> first time; Linux: the `.AppImage` is self-contained. Windows installers are
> in progress.

**Run from source:**

```bash
npm install
npm run desktop:dev     # build the engine sidecar + launch the desktop app
# or, the web demo only:
npm run dev             # → http://localhost:5183  (demo site at /, IDE at /app.html)
```

Requires Node 20+, plus Rust (for the desktop shell) and Docker (optional, for
isolated Verify).

## How it works

Sutra is two clean layers with a typed seam between them:

- **The loop is ours.** A headless Node engine (`engine/`) drives
  Sense → Build → Verify → Reflect: a generic tool-use loop, shadow-branch git,
  a workspace-root fs guard, real command execution behind consent, and a real
  merge — all provider-agnostic and covered by a fast, network-free test suite.
- **The intelligence is yours.** The engine only ever talks to a small
  `LlmProvider` contract, so any model or agent that speaks it (Anthropic,
  OpenAI-compatible, or your own MCP tools) plugs in without touching the loop.

The desktop app (`src-tauri/`) is a featherweight [Tauri](https://tauri.app)
shell over your OS's native webview that manages the engine as a local sidecar
and renders the same React UI (`src/`) the web demo uses. The full picture —
contracts, file layout, and the plan that got here — is in
[ARCHITECTURE.md](./ARCHITECTURE.md) and [ROADMAP.md](./ROADMAP.md).

## Project status

Phases 0–5 of the [roadmap](./ROADMAP.md) are complete: the real Build →
Verify → Reflect → Merge loop, BYO-LLM, the desktop shell, isolated container
Verify, and BYO-agent MCP tools all ship. The current release is
**`v2.0.0-beta`** (macOS + Linux). The path to a signed `v2.0.0` and Windows
installers is tracked in the [issues](https://github.com/chetanparab/sutra/issues)
and [RELEASING.md](./RELEASING.md).

## Contributing

Contributions are welcome — please read [CONTRIBUTING.md](./CONTRIBUTING.md) and
our [Code of Conduct](./CODE_OF_CONDUCT.md). All changes go through a pull
request with passing CI and review. The engine's test suite (`npm test`) is
fully mocked/fixture-based — no network, no API cost — so it's a fast, safe place
to start.

## Security

Please report vulnerabilities privately — see the root [SECURITY.md](./SECURITY.md).
The engine's threat model (untrusted repos, prompt injection, the boundaries
that hold regardless) is [engine/SECURITY.md](./engine/SECURITY.md). Do not open
public issues for security problems.

## License

Licensed under the [Apache License 2.0](./LICENSE). See [NOTICE](./NOTICE) and
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for attributions.

**The "Sutra" name and logo are trademarks** and are not covered by the code
license (Apache-2.0 grants no trademark rights). You may build on the code;
please don't ship forks under the Sutra name or brand.

<div align="center">
<sub>© 2026 Chetan Parab · Built as part of the Analogy Architect toolset.</sub>
</div>
