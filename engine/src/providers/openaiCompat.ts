/**
 * BYO-LLM: the OpenAI-compatible provider adapter (ROADMAP.md Phase 1, issue
 * #8). Deliberately hand-rolled against the wire format, not the official
 * `openai` SDK — the whole point of "OpenAI-compatible" is working against
 * real OpenAI *and* any endpoint that speaks the same shape (local vLLM / LM
 * Studio, Groq, Ollama's compat mode, …), and a hand-rolled fetch() client is
 * more portable there than an opinionated official SDK. Translation functions
 * are pure and exported for fixture-based testing — see openaiCompat.test.ts.
 */
import type { ChatMessage, Completion, LlmProvider, ToolCall, ToolDef } from '../../../src/contracts/llm'
import { ContextLimitError, fetchWithRetry, looksLikeContextLimit } from './retry'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

// ── wire types (OpenAI Chat Completions API — the minimal shape we use) ────

interface OpenAiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string } // arguments is a JSON *string*, unlike Anthropic's object
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: OpenAiToolCall[]
  tool_call_id?: string
}

interface OpenAiRequestBody {
  model: string
  messages: OpenAiMessage[]
  tools?: { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }[]
  max_tokens?: number
  temperature?: number
}

interface OpenAiResponseBody {
  choices: { message: OpenAiMessage; finish_reason: 'stop' | 'tool_calls' | 'length' | string }[]
  usage?: { prompt_tokens: number; completion_tokens: number }
}

// ── request translation ─────────────────────────────────────────────────────

/**
 * Generic ChatMessage[] → OpenAI's shape. Simpler than Anthropic's: system and
 * tool roles map directly, one generic message → one OpenAI message each, no
 * merging needed. Tool-call arguments must be a JSON *string* on the wire.
 */
export function toOpenAiRequest(
  messages: ChatMessage[],
  tools: ToolDef[] | undefined,
  opts: { model: string; maxTokens?: number; temperature?: number },
): OpenAiRequestBody {
  const openAiMessages: OpenAiMessage[] = messages.map((msg) => {
    if (msg.role === 'tool') {
      return { role: 'tool', content: msg.content, tool_call_id: msg.toolCallId ?? '' }
    }
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content,
        tool_calls: msg.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } })),
      }
    }
    return { role: msg.role, content: msg.content }
  })

  return {
    model: opts.model,
    messages: openAiMessages,
    ...(tools && tools.length > 0
      ? { tools: tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } })) }
      : {}),
    ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  }
}

// ── response translation ────────────────────────────────────────────────────

const FINISH_REASON_MAP: Record<string, Completion['stopReason']> = {
  stop: 'stop',
  tool_calls: 'tool_use',
  length: 'length',
}

export function fromOpenAiResponse(body: OpenAiResponseBody): Completion {
  const choice = body.choices[0]
  if (!choice) throw new Error('OpenAI-compatible response had no choices.')

  // A malformed arguments string from the model is a real provider-side issue —
  // surfaced as a thrown error for now (Phase 4 owns broader error-path
  // recovery; see ROADMAP.md).
  const toolCalls: ToolCall[] | undefined = choice.message.tool_calls?.map((tc) => {
    let args: Record<string, unknown>
    try {
      args = JSON.parse(tc.function.arguments) as Record<string, unknown>
    } catch {
      throw new Error(`Model returned malformed JSON in tool call arguments for "${tc.function.name}": ${tc.function.arguments.slice(0, 200)}`)
    }
    return { id: tc.id, name: tc.function.name, arguments: args }
  })

  return {
    text: choice.message.content ?? '',
    ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    stopReason: FINISH_REASON_MAP[choice.finish_reason] ?? 'stop',
    ...(body.usage ? { usage: { inputTokens: body.usage.prompt_tokens, outputTokens: body.usage.completion_tokens } } : {}),
  }
}

// ── the provider ─────────────────────────────────────────────────────────────

export interface OpenAiCompatProviderOptions {
  /** Defaults to process.env.OPENAI_API_KEY. */
  apiKey?: string
  /** Defaults to process.env.OPENAI_BASE_URL, then the real OpenAI API. Override to target a compatible endpoint. */
  baseUrl?: string
  /** Stable id override — useful when this is really "groq" or "ollama" wearing the OpenAI shape. */
  id?: string
  /** Injection point for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

export function createOpenAiCompatProvider(options: OpenAiCompatProviderOptions = {}): LlmProvider {
  return {
    id: options.id ?? 'openai-compat',
    async complete(req) {
      const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set. Export it before running a real build — never pass it as a CLI flag (it would leak into shell history).')
      }
      const baseUrl = options.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL

      const body = toOpenAiRequest(req.messages, req.tools, {
        model: req.opts.model,
        maxTokens: req.opts.maxTokens,
        temperature: req.opts.temperature,
      })

      // Rate limits / transient 5xx / network blips retry with backoff inside
      // fetchWithRetry (Phase 4, issue #38); what comes back here is final.
      const res = await fetchWithRetry(
        `${baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
        { signal: req.opts.signal, fetchImpl: options.fetchImpl },
      )

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        if (looksLikeContextLimit(res.status, errText)) throw new ContextLimitError(options.id ?? 'openai-compat', errText)
        throw new Error(`OpenAI-compatible API error ${res.status}: ${errText.slice(0, 500)}`)
      }

      return fromOpenAiResponse((await res.json()) as OpenAiResponseBody)
    },
  }
}
