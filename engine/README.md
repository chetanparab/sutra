# `engine/` — the headless, real-execution core

**Phase 0 + Phase 1** of [`ROADMAP.md`](../ROADMAP.md). A Node-only module tree —
zero React/DOM imports — that is becoming the real thing behind the loop's
Sense → Build → Verify → Reflect phases. It lives at the repo's top level, not
under `src/`, on purpose: the web app's Vite build must never be able to pull
`node:fs`/`node:child_process` into its module graph.

## What's here

| Path | What | Phase |
| --- | --- | --- |
| `src/tools/workspace.ts` | `resolveInWorkspace` — the primary safety boundary. Every fs tool call is checked to stay inside the chosen workspace root; rejects `../` traversal and symlink escapes. | 0 |
| `src/tools/fs.ts` | `readFile`, `listDir`, `editFile` (exact-match `oldString`/`newString`, refuses an ambiguous match rather than guessing). | 0 |
| `src/tools/toolDefs.ts` | Exposes the fs tools as `ToolDef`s a real model can call, plus the dispatcher that executes a `ToolCall` and translates thrown errors into a result the model can see and react to. | 1 |
| `src/git/shadowBranch.ts` | The shadow-branch model: `createShadowBranch`, `commitIteration`, `rollbackTo`, `diffSinceBranchPoint`. A loop run gets its own branch; the user's real branch is never touched until Merge (a later phase). | 0 |
| `src/build/toolLoop.ts` | The generic tool-use loop — talks only to the `LlmProvider` contract, has no idea which provider is behind it. Drives turns until the model stops calling tools or a guardrail trips. | 1 |
| `src/build/guardrails.ts` | Day-one hard caps: max tokens per run, max tool-turns per iteration. Enforced inside the loop, not a UI-layer nicety. | 1 |
| `src/build/costEstimate.ts` | A pre-run cost *ceiling* (worst case, from the token cap — nobody knows real usage before a run happens) and a post-run *actual* cost from real usage. | 1 |
| `src/providers/anthropic.ts` | Real Anthropic adapter — plain `fetch()`, no SDK dependency. Translation functions are pure and exported for fixture-based testing. | 1 |
| `src/providers/openaiCompat.ts` | Real OpenAI-compatible adapter (OpenAI itself, or any endpoint speaking the same wire format — local vLLM, LM Studio, Groq, …). Also hand-rolled, for the same portability reason. | 1 |
| `src/commands/build.ts` | The real Build command: shadow branch → tool loop → commit + diff, or a clean rollback (no partial edit left on disk) on an aborted/guardrail-tripped run. | 1 |
| `src/commands/applyTestEdit.ts` | Phase 0's scripted demo command — no LLM, self-bootstraps a toy fixture. | 0 |
| `src/cli.ts` | Thin argv dispatch around `commands/` — this is what `npm run engine` runs. | 0+1 |
| `src/testing/scriptedProvider.ts` | A test-only `LlmProvider` that plays back a scripted multi-turn conversation — what proves the tool loop's orchestration (turns, error recovery, guardrails, abort) without any real model. | 1 |
| `evals/fixtures/makeToyRepo.ts` | Generates a tiny, deterministic git repo at run time (never checked in — a nested `.git` inside this repo's own `.git` is a real mess). | 0 |
| `evals/tasks/task1AddGuardClause.ts` | Phase 1's first hand-picked benchmark: fixture + intent + a heuristic structural check. | 1 |
| `evals/run-benchmark.ts` | Runs the benchmark task against a **real** provider — see below. | 1 |

## Running it

```bash
# Phase 0 — no LLM, zero cost
npm run engine -- apply-test-edit <path>   # scripted edit on a shadow branch;
                                            # bootstraps a toy fixture if <path>
                                            # doesn't exist
npm run engine -- rollback <path> <sha>    # hard-resets <path> to <sha>

# Phase 1 — a real LLM call, real cost. Requires the repo at <path> to already
# exist (unlike apply-test-edit, this does not bootstrap a fixture — silently
# redirecting a real paid call to a throwaway repo would be a confusing
# default). Requires an API key as an env var, never a flag:
ANTHROPIC_API_KEY=sk-... npm run engine -- build <path> "<intent>" --provider anthropic --model claude-...
OPENAI_API_KEY=sk-...    npm run engine -- build <path> "<intent>" --provider openai-compat --model gpt-...

npm run typecheck:engine   # tsc --noEmit against engine/
npm test                    # engine/**/*.test.ts — all mocked/fixture-based, no network, no cost
```

## What's tested how

- **The tool loop's orchestration** (`toolLoop.test.ts`, `build.test.ts`) is proven with `scriptedProvider` — a scripted fake that plays back multi-turn tool-calling conversations. This is what proves turns, tool-result feedback, error recovery, guardrail enforcement and abort-cleanup are all correct, independent of whether any real model is any good.
- **The Anthropic and OpenAI-compat adapters' wire-format translation** (`anthropic.test.ts`, `openaiCompat.test.ts`) is proven against literal fixture request/response JSON — no live network call.
- **What is *not* tested by `npm test`, on purpose**: whether a real model actually writes correct code. That needs a live call with a real key, and CI must never make paid, flaky, real-model calls on every push. `npm run eval:task1` is the human-in-the-loop way to check that, manually, with your own key — see `evals/run-benchmark.ts`'s own comment for why it stays out of CI.

```bash
ANTHROPIC_API_KEY=sk-... npm run eval:task1 -- --provider anthropic --model claude-...
```

## Why Phase 0's edit is scripted, not model-authored

Phase 0's job was proving the *plumbing* — real files, real git, a real CLI —
with zero AI risk and zero API cost, before any AI risk was introduced. Phase 1
built the real model integration on top of exactly that plumbing without
changing it.
