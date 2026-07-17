# `src/contracts` — the bring-your-own seams

Sutra is a **conductor, not a crew**. It owns the loop (Sense → Build → Verify →
Reflect, the human gates, the budget, the flight recorder, review and governance).
It does **not** own the intelligence. Agents and language models plug in behind the
typed contracts in this folder.

> These are **design targets, open to proposals.** They compile, and they carry
> reference implementations, but the schemas are meant to be argued about in issues
> and PRs — not treated as frozen. See [`ARCHITECTURE.md`](../../ARCHITECTURE.md).

## The files

| File | What it defines |
| --- | --- |
| [`llm.ts`](llm.ts) | **BYO-LLM** — `LlmProvider`, `ModelProfile`, message/tool/completion types. One `complete()` call every model sits behind. |
| [`agent.ts`](agent.ts) | **BYO-agent** — `AgentManifest`, `AgentAdapter`, `PhaseRequest`/`PhaseResult`. An agent is a manifest + a transport (MCP · HTTP · process). |
| [`registry.ts`](registry.ts) | `AgentRegistry` (route a phase + capabilities → agents) and `ProviderRegistry` (profile id → provider). |
| [`simulated.ts`](simulated.ts) | Reference implementations — the exact shape a real adapter takes, with canned output. |

## Add a real model (BYO-LLM)

```ts
import type { LlmProvider } from './contracts'

export const anthropic: LlmProvider = {
  id: 'anthropic',
  async complete({ messages, tools, opts }) {
    // call your SDK with opts.model, map the response to Completion
    return { text: '…', stopReason: 'stop' }
  },
}
```

Register it, point a `ModelProfile` at it, and a loop role can target it. **Keys
never touch this repo** — desktop keeps them in the OS keychain, web uses a
user-owned proxy or encrypted-at-rest client keys.

## Add a real agent (BYO-agent)

Implement `AgentAdapter` over your transport. MCP is the first-class path: an MCP
server that speaks this contract joins the crew with no core changes. See
[`simulated.ts`](simulated.ts) for the shape, then swap the body for a real call.

## Where this is going

The loop today runs on a scripted crew (`src/loop/script.ts`) — the honest default.
The roadmap in [`ARCHITECTURE.md`](../../ARCHITECTURE.md) moves one piece at a time
from "simulated" to "real" behind exactly these interfaces, so a contributor can
land a single adapter without touching the loop. Good first contributions:

- an `LlmProvider` for one provider (Anthropic / OpenAI-compatible / Ollama)
- an MCP `AgentAdapter` that serves the Build phase
- a compute adapter for the Verify phase beyond WASM (container / cloud sandbox)
