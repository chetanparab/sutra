# Contributing to Sutra

Thanks for your interest! Sutra is a concept preview moving toward a real,
BYO-agent/BYO-LLM product, and thoughtful contributions — bug fixes, accessibility
improvements, docs, new adapters — are welcome.

**Start here:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) explains the contracts (the
seams between the loop and the intelligence you bring); [`ROADMAP.md`](./ROADMAP.md)
is the phased engineering plan — what's being built, in what order, and why. Issues
labeled [`good first issue`](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22)
are scoped against a specific roadmap phase.

## Ground rules

- Be kind. This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md).
- By contributing, you agree your contributions are licensed under the project's
  [Apache License 2.0](./LICENSE).
- Don't submit code you don't have the right to contribute, and don't paste
  proprietary or secret material.

## Workflow

`main` is protected: direct pushes are blocked, and every change lands through a
pull request with **passing CI** and **at least one approving review**.

1. **Fork** the repo and create a branch: `git checkout -b fix/short-description`.
2. **Develop** with `npm run dev`. Working on the real-execution engine (see
   [ROADMAP.md](./ROADMAP.md), Phase 0+)? Use `npm run engine -- <args>` — it's a
   separate, Node-only module tree under [`engine/`](./engine), isolated from the
   web app on purpose.
3. **Verify** before you push — this must pass, exactly as CI runs it:
   ```bash
   npm run build             # tsc --noEmit && vite build (the web app)
   npm run typecheck:engine  # tsc --noEmit against engine/
   npm test                  # engine/**/*.test.ts, via Node's built-in test runner
   ```
4. **Open a pull request** against `main`. Fill in the template: what changed, why,
   and how you verified it. Link any related issue.
5. A maintainer reviews. Once CI is green and the review is approved, it merges
   (squash, linear history).

## Style

- TypeScript, React 19, Tailwind v4. Match the surrounding code — components stay
  small and readable.
- Keep the design token system intact: never hard-code theme colors; use the
  semantic tokens (`text-primary`, `bg-accent`, `border-line`, …) so every theme
  keeps working.
- No new runtime dependency without a clear reason — the bundle stays light.

## Reporting bugs & ideas

Open an issue with clear reproduction steps (for bugs) or the problem you're
trying to solve (for features). For **security** issues, follow
[SECURITY.md](./SECURITY.md) instead — never a public issue.
