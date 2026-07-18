/**
 * BYO-LLM — the provider contract.
 *
 * Sutra never bundles a model. A "role" in the loop (Sense, Build, …) targets a
 * model **profile**, and every profile is served by one normalized provider that
 * implements {@link LlmProvider}. Anthropic, OpenAI, Google, Mistral, anything
 * OpenAI-compatible, or a fully local runtime (Ollama / llama.cpp / LM Studio)
 * are all just an adapter behind this interface.
 *
 * This file is the *contract*, not an implementation — it is a design target that
 * is deliberately open to proposals (see ARCHITECTURE.md and CONTRIBUTING.md).
 * Adding a provider means implementing `LlmProvider`; nothing in the core changes.
 */

export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: Role
  content: string
  /**
   * Present on `role: 'assistant'` when this turn made tool calls — carried
   * forward in history so a provider adapter can reconstruct the correct
   * wire-level conversation (both Anthropic's and OpenAI's formats require the
   * prior tool_use/tool_calls to be echoed back for a follow-up tool result to
   * correlate correctly). Added in Phase 1 once the real tool-use loop needed it —
   * see engine/src/build/toolLoop.ts.
   */
  toolCalls?: ToolCall[]
  /** Present on `role: 'tool'` — which tool call this message answers. */
  toolCallId?: string
}

export interface ToolDef {
  name: string
  description: string
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  /** Parsed arguments as provided by the model. */
  arguments: Record<string, unknown>
}

export interface GenOpts {
  model: string
  temperature?: number
  maxTokens?: number
  /** Abort in-flight generation (timeouts, budget caps, user cancel). */
  signal?: AbortSignal
}

export interface Usage {
  inputTokens: number
  outputTokens: number
}

export interface Completion {
  text: string
  /** Tool calls the model requested, if any. */
  toolCalls?: ToolCall[]
  stopReason: 'stop' | 'length' | 'tool_use' | 'error'
  usage?: Usage
}

/**
 * The single seam every model sits behind. Keep it minimal on purpose: one
 * `complete` call the loop can await. Streaming, if a provider supports it, is an
 * additive concern layered on top — it must not widen this core contract.
 */
export interface LlmProvider {
  /** Stable id, e.g. 'anthropic' | 'openai' | 'ollama' | 'openai-compat'. */
  readonly id: string
  complete(req: { messages: ChatMessage[]; tools?: ToolDef[]; opts: GenOpts }): Promise<Completion>
}

/**
 * A named model configuration a loop role references (e.g. cheap model for Sense,
 * a strong model for Build), each with its own budget cap. Profiles live in the
 * user's config — never in this repo, never with a key in them.
 */
export interface ModelProfile {
  id: string
  provider: string // LlmProvider.id
  model: string
  temperature?: number
  /** Optional per-profile spend ceiling, enforced by the caller. */
  maxTokensPerRun?: number
}
