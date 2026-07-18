/**
 * BYO-LLM: the Anthropic provider adapter (ROADMAP.md Phase 1, issue #8).
 * Plain `fetch()` — no SDK dependency, so the exact bytes sent and received are
 * visible in this one file. The translation functions (toAnthropicRequest /
 * fromAnthropicResponse) are pure and exported so they're unit-testable against
 * fixture JSON, without a live network call — see anthropic.test.ts.
 */
import type { ChatMessage, Completion, LlmProvider, ToolCall, ToolDef } from '../../../src/contracts/llm'
import { ContextLimitError, fetchWithRetry, looksLikeContextLimit } from './retry'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const DEFAULT_MAX_TOKENS = 4096

// ── wire types (Anthropic Messages API — the minimal shape we use) ─────────

interface AnthropicTextBlock {
  type: 'text'
  text: string
}
interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}
interface AnthropicToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}
type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

interface AnthropicRequestBody {
  model: string
  max_tokens: number
  system?: string
  messages: AnthropicMessage[]
  tools?: { name: string; description: string; input_schema: Record<string, unknown> }[]
  temperature?: number
}

interface AnthropicResponseBody {
  content: AnthropicContentBlock[]
  stop_reason: 'end_turn' | 'stop_sequence' | 'tool_use' | 'max_tokens' | null
  usage: { input_tokens: number; output_tokens: number }
}

// ── request translation ─────────────────────────────────────────────────────

/**
 * Generic ChatMessage[] → Anthropic's shape. System messages are pulled out to
 * the top-level `system` field (Anthropic doesn't accept them in `messages`).
 * Consecutive `role: 'tool'` messages (one loop iteration can call several
 * tools in one turn) are merged into a single Anthropic `user` turn with
 * multiple tool_result blocks — Anthropic has no separate "tool" role.
 */
export function toAnthropicRequest(
  messages: ChatMessage[],
  tools: ToolDef[] | undefined,
  opts: { model: string; maxTokens?: number; temperature?: number },
): AnthropicRequestBody {
  const systemParts: string[] = []
  const anthropicMessages: AnthropicMessage[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content)
      continue
    }

    if (msg.role === 'tool') {
      const block: AnthropicToolResultBlock = { type: 'tool_result', tool_use_id: msg.toolCallId ?? '', content: msg.content }
      const last = anthropicMessages.at(-1)
      // Merge into the previous user turn if it's also a run of tool_results.
      if (last && last.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) {
        ;(last.content as AnthropicToolResultBlock[]).push(block)
      } else {
        anthropicMessages.push({ role: 'user', content: [block] })
      }
      continue
    }

    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      const content: AnthropicContentBlock[] = []
      if (msg.content) content.push({ type: 'text', text: msg.content })
      for (const tc of msg.toolCalls) content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments })
      anthropicMessages.push({ role: 'assistant', content })
      continue
    }

    anthropicMessages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content })
  }

  return {
    model: opts.model,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(systemParts.length > 0 ? { system: systemParts.join('\n\n') } : {}),
    messages: anthropicMessages,
    ...(tools && tools.length > 0
      ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) }
      : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  }
}

// ── response translation ────────────────────────────────────────────────────

const STOP_REASON_MAP: Record<string, Completion['stopReason']> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  tool_use: 'tool_use',
  max_tokens: 'length',
}

export function fromAnthropicResponse(body: AnthropicResponseBody): Completion {
  const text = body.content
    .filter((b): b is AnthropicTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const toolCalls: ToolCall[] = body.content
    .filter((b): b is AnthropicToolUseBlock => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, arguments: b.input }))

  return {
    text,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    stopReason: STOP_REASON_MAP[body.stop_reason ?? 'end_turn'] ?? 'stop',
    usage: { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens },
  }
}

// ── the provider ─────────────────────────────────────────────────────────────

export interface AnthropicProviderOptions {
  /** Defaults to process.env.ANTHROPIC_API_KEY. */
  apiKey?: string
  /** Injection point for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

export function createAnthropicProvider(options: AnthropicProviderOptions = {}): LlmProvider {
  return {
    id: 'anthropic',
    async complete(req) {
      const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not set. Export it before running a real build — never pass it as a CLI flag (it would leak into shell history).')
      }

      const body = toAnthropicRequest(req.messages, req.tools, {
        model: req.opts.model,
        maxTokens: req.opts.maxTokens,
        temperature: req.opts.temperature,
      })

      // Rate limits / transient 5xx / network blips retry with backoff inside
      // fetchWithRetry (Phase 4, issue #38); what comes back here is final.
      const res = await fetchWithRetry(
        API_URL,
        {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
        { signal: req.opts.signal, fetchImpl: options.fetchImpl },
      )

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        if (looksLikeContextLimit(res.status, errText)) throw new ContextLimitError('anthropic', errText)
        throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 500)}`)
      }

      return fromAnthropicResponse((await res.json()) as AnthropicResponseBody)
    },
  }
}
