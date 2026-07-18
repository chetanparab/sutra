/**
 * A test-only LlmProvider that plays back a fixed sequence of turns — one entry
 * per call to `complete()`. This is what proves runBuildLoop's orchestration is
 * correct (drives multiple turns, feeds tool results back, stops correctly,
 * respects guardrails) without any real model or network call. Not for
 * production use — see src/contracts/simulated.ts for the single-turn
 * echo provider Phase 0 already established.
 */
import type { ChatMessage, Completion, GenOpts, LlmProvider, ToolDef } from '../../../src/contracts/llm'

export interface ScriptedTurn {
  text: string
  toolCalls?: Completion['toolCalls']
  usage?: Completion['usage']
}

export function scriptedProvider(script: ScriptedTurn[]): LlmProvider & { callLog: { messages: ChatMessage[]; tools?: ToolDef[] }[] } {
  let turnIndex = 0
  const callLog: { messages: ChatMessage[]; tools?: ToolDef[] }[] = []

  return {
    id: 'scripted-test-provider',
    callLog,
    async complete(req: { messages: ChatMessage[]; tools?: ToolDef[]; opts: GenOpts }): Promise<Completion> {
      callLog.push({ messages: req.messages, tools: req.tools })
      if (turnIndex >= script.length) {
        throw new Error(`scriptedProvider ran out of scripted turns (called ${turnIndex + 1} times, script has ${script.length}).`)
      }
      const turn = script[turnIndex]
      turnIndex += 1
      return {
        text: turn.text,
        toolCalls: turn.toolCalls,
        stopReason: turn.toolCalls && turn.toolCalls.length > 0 ? 'tool_use' : 'stop',
        usage: turn.usage ?? { inputTokens: 100, outputTokens: 50 },
      }
    },
  }
}
