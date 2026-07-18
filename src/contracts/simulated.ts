/**
 * Reference implementations — the shape a real adapter takes.
 *
 * These satisfy the contracts with canned output so contributors have a concrete,
 * compiling example to copy. They mirror the app's current scripted crew: today
 * the demo runs on a hand-written script (`src/loop/script.ts`); a real MCP / HTTP
 * adapter drops in *here*, implementing the same interfaces, and the loop stops
 * being simulated one agent at a time.
 *
 * To add a real provider: implement {@link LlmProvider} against your SDK.
 * To add a real agent: implement {@link AgentAdapter} against MCP / HTTP / a process.
 */

import type { AgentAdapter, AgentManifest, PhaseRequest, PhaseResult } from './agent'
import type { ChatMessage, Completion, LlmProvider, ToolDef } from './llm'

/** A provider that echoes a fixed answer — stands in for a real model in demos/tests. */
export const simulatedProvider: LlmProvider = {
  id: 'simulated',
  async complete(req: { messages: ChatMessage[]; tools?: ToolDef[] }): Promise<Completion> {
    const last = req.messages.at(-1)?.content ?? ''
    return {
      text: `// simulated completion for: ${last.slice(0, 80)}`,
      stopReason: 'stop',
      usage: { inputTokens: 0, outputTokens: 0 },
    }
  },
}

/**
 * A builder that returns a canned change + memo. Swap the body for a real MCP call
 * (`provider.complete(...)` + tool use) and this becomes a real builder with no
 * change to the loop that drives it.
 */
export function simulatedBuilder(id = 'builder-sim'): AgentAdapter {
  const manifest: AgentManifest = {
    id,
    role: 'builder',
    transport: 'process',
    endpoint: 'sim://builder',
    capabilities: ['edit-code', 'write-tests'],
    phases: ['build'],
  }
  return {
    manifest,
    async serve(req: PhaseRequest): Promise<PhaseResult> {
      return {
        // `edits` (exact-match old→new strings) is the primary format — reliable for
        // a model to author, unlike a unified diff. See ROADMAP.md, Phase 1.
        changes: [
          {
            path: 'services/payments/retry/executor.ts',
            edits: [{ oldString: '// TODO: implement', newString: `// iteration ${req.iteration}: implement "${req.intent}"` }],
          },
        ],
        memo: `Built against ${req.signals.length} acceptance signals; handing to Verify.`,
      }
    },
    async health() {
      return { ok: true, detail: 'simulated' }
    },
  }
}
