/**
 * ROADMAP.md Phase 1: "a small, generic tool-use loop … generic on purpose —
 * provider-specific tool-calling formats are the adapter's job, not the
 * loop's." This file only ever talks to the LlmProvider contract — it has no
 * idea whether it's driving Anthropic, an OpenAI-compatible endpoint, or a
 * fake test provider.
 */
import type { ChatMessage, LlmProvider, ToolCall, ToolDef } from '../../../src/contracts/llm'
import type { FsTools } from '../tools/fs'
import { executeFsToolCall, FS_TOOL_DEFS } from '../tools/toolDefs'
import { DEFAULT_GUARDRAILS, GuardrailViolation, type BuildGuardrails } from './guardrails'

const SYSTEM_PROMPT =
  'You are a careful software engineer working inside a single git repository. ' +
  'You have three tools: read_file, list_dir, edit_file. Always read_file before ' +
  'editing it, so oldString matches the real current content exactly. edit_file ' +
  'requires oldString to match exactly once — include enough surrounding context ' +
  '(a full line or more) to make it unique; if the edit is rejected, the error ' +
  'quotes the file\'s actual nearest text — copy from it exactly. Very large files ' +
  'are truncated in read_file output, with a marker saying so; edit only within ' +
  'the shown portion. Make the smallest change that satisfies the intent — do not ' +
  'refactor unrelated code. When you are done, reply with a short summary of what ' +
  'changed and call no further tools.'

export interface RunBuildLoopParams {
  provider: LlmProvider
  model: string
  intent: string
  tools: FsTools
  guardrails?: BuildGuardrails
  signal?: AbortSignal
  /**
   * BYO-agent (issue #9): extra tools discovered from the user's MCP
   * server(s), offered to the model ALONGSIDE the built-in fs tools. Their
   * names are namespaced (e.g. "mcp__…") so they can't collide. When the model
   * calls one, `dispatchExtraTool` routes it to the MCP client.
   */
  extraTools?: ToolDef[]
  dispatchExtraTool?: (call: ToolCall) => Promise<{ content: string; isError: boolean }>
}

export interface ToolCallLogEntry {
  turn: number
  name: string
  path?: string
  isError: boolean
}

export interface RunBuildLoopResult {
  turns: number
  totalInputTokens: number
  totalOutputTokens: number
  finalText: string
  toolCallLog: ToolCallLogEntry[]
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Build loop aborted.', 'AbortError')
}

/**
 * Drives one Build iteration to completion: calls the provider, executes any
 * tool calls it makes against real fs tools, feeds the results back, and
 * repeats until the model stops calling tools or a guardrail trips. Throws
 * GuardrailViolation (caps exceeded) or an AbortError (signal fired) rather
 * than returning a partial result — the caller decides what "partial" means
 * for its own commit/rollback policy.
 */
export async function runBuildLoop(params: RunBuildLoopParams): Promise<RunBuildLoopResult> {
  const guardrails = params.guardrails ?? DEFAULT_GUARDRAILS
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: params.intent },
  ]

  let totalInputTokens = 0
  let totalOutputTokens = 0
  const toolCallLog: ToolCallLogEntry[] = []

  const extraTools = params.extraTools ?? []
  const extraToolNames = new Set(extraTools.map((t) => t.name))
  const offeredTools = extraTools.length > 0 ? [...FS_TOOL_DEFS, ...extraTools] : FS_TOOL_DEFS

  for (let turn = 1; turn <= guardrails.maxToolTurns; turn++) {
    throwIfAborted(params.signal)

    const completion = await params.provider.complete({
      messages,
      tools: offeredTools,
      opts: { model: params.model, signal: params.signal },
    })

    totalInputTokens += completion.usage?.inputTokens ?? 0
    totalOutputTokens += completion.usage?.outputTokens ?? 0
    if (totalInputTokens + totalOutputTokens > guardrails.maxTokens) {
      throw new GuardrailViolation(
        'max-tokens',
        `Exceeded the ${guardrails.maxTokens}-token budget for this run (used ${totalInputTokens + totalOutputTokens}).`,
      )
    }

    if (!completion.toolCalls || completion.toolCalls.length === 0) {
      return { turns: turn, totalInputTokens, totalOutputTokens, finalText: completion.text, toolCallLog }
    }

    messages.push({ role: 'assistant', content: completion.text, toolCalls: completion.toolCalls })

    for (const call of completion.toolCalls) {
      throwIfAborted(params.signal)
      // Route MCP tools to their client; everything else is a built-in fs tool.
      const result =
        extraToolNames.has(call.name) && params.dispatchExtraTool
          ? { toolCallId: call.id, ...(await params.dispatchExtraTool(call)) }
          : executeFsToolCall(params.tools, call)
      toolCallLog.push({
        turn,
        name: call.name,
        path: typeof call.arguments.path === 'string' ? call.arguments.path : undefined,
        isError: result.isError,
      })
      messages.push({ role: 'tool', content: result.content, toolCallId: result.toolCallId })
    }
  }

  throw new GuardrailViolation(
    'max-turns',
    `Exceeded the ${guardrails.maxToolTurns}-turn budget without the model finishing (still calling tools).`,
  )
}
