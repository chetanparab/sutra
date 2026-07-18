# `engine/` — the headless, real-execution core

**Phase 0** of [`ROADMAP.md`](../ROADMAP.md). A Node-only module tree — zero
React/DOM imports — that will become the real thing behind the loop's Sense →
Build → Verify → Reflect phases. It lives at the repo's top level, not under
`src/`, on purpose: the web app's Vite build must never be able to pull
`node:fs`/`node:child_process` into its module graph.

## What's here (Phase 0)

| Path | What |
| --- | --- |
| `src/tools/workspace.ts` | `resolveInWorkspace` — the primary safety boundary. Every fs tool call is checked to stay inside the chosen workspace root; rejects `../` traversal and symlink escapes. |
| `src/tools/fs.ts` | The three fs tools Phase 1's tool-use loop will call: `readFile`, `listDir`, `editFile` (exact-match `oldString`/`newString`, refuses an ambiguous match rather than guessing). |
| `src/git/shadowBranch.ts` | The shadow-branch model: `createShadowBranch`, `commitIteration`, `rollbackTo`, `diffSinceBranchPoint`. A loop run gets its own branch; the user's real branch is never touched until Merge (a later phase). |
| `src/commands/` | The testable logic behind the CLI — `applyTestEdit` (Phase 0's acceptance-criterion command) and `rollback`. |
| `src/cli.ts` | Thin argv dispatch around `commands/` — this is what `npm run engine` actually runs. |
| `src/providers/fakeProvider.test.ts` | Proves `simulatedProvider` (already in [`../src/contracts/simulated.ts`](../src/contracts/simulated.ts)) is callable from this Node context — Phase 0's "fake/echo `LlmProvider`" deliverable, satisfied by reuse rather than a near-duplicate. |
| `evals/fixtures/makeToyRepo.ts` | Generates a tiny, deterministic git repo at run time (never checked in — a nested `.git` inside this repo's own `.git` is a real mess to commit). |

## Running it

```bash
npm run engine -- apply-test-edit <path>   # applies a scripted edit on a shadow
                                            # branch; bootstraps the toy fixture at
                                            # <path> if nothing exists there yet
npm run engine -- rollback <path> <sha>    # hard-resets <path> to <sha>

npm run typecheck:engine                    # tsc --noEmit against engine/
npm test                                     # engine/**/*.test.ts
```

## Why the edit is scripted, not model-authored

Phase 0's job is proving the *plumbing* — real files, real git, a real CLI — with
zero AI risk and zero API cost. `apply-test-edit` performs a fixed, known edit;
wiring an actual `LlmProvider` into a decision-making loop is Phase 1's job (see
[ROADMAP.md](../ROADMAP.md#phase-1--real-build-byo-llm)).
