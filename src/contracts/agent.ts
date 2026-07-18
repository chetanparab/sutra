/**
 * BYO-agent — the agent contract.
 *
 * An agent is a **manifest plus a transport**, never code baked into Sutra. A loop
 * phase declares the capabilities it needs; the courier (Hermes) routes each
 * iteration's directive to any registered agent that satisfies them. The scripted
 * crew (Scout, Builders, Verifier, Sentinel, Hermes) is just the *default* set you
 * replace one agent at a time.
 *
 * Primary transport is MCP (Model Context Protocol): an MCP server that speaks this
 * contract joins the crew with no Sutra-side code. HTTP and local-process adapters
 * cover everything else. This file is the contract, open to proposals.
 */

import type { LlmProvider, ModelProfile } from './llm'

export type AgentRole = 'scout' | 'builder' | 'verifier' | 'sentinel' | 'courier' | 'custom'
export type AgentTransport = 'mcp' | 'http' | 'process'
export type LoopPhase = 'sense' | 'build' | 'verify' | 'reflect'

/** A capability an agent advertises and a phase can require. */
export type Capability = 'read-context' | 'edit-code' | 'write-tests' | 'run-signals' | 'scan-policy' | 'route-memo' | string

/**
 * The user-owned description of one agent. Lives in *their* config (a local file
 * on desktop, a user-owned store on web) — never in this repo.
 */
export interface AgentManifest {
  id: string
  role: AgentRole
  transport: AgentTransport
  /** stdio://./agents/builder · https://… · a local command — transport decides. */
  endpoint: string
  capabilities: Capability[]
  /** Which loop phases this agent may serve. */
  phases: LoopPhase[]
  /** Which BYO-LLM profile it uses, if any (ref into the user's profiles). */
  model?: string
}

/** What the control plane hands an agent for one unit of work. */
export interface PhaseRequest {
  phase: LoopPhase
  iteration: number
  /** The outcome to converge on, in the user's words. */
  intent: string
  /** Machine-checkable acceptance signals the change is measured against. */
  signals: { id: string; name: string }[]
  /** Last iteration's courier memo — the loop's memory between passes. */
  priorMemo?: string
  /** Live context the agent may read (conventions, ownership, telemetry…). */
  context?: Record<string, unknown>
  signal?: AbortSignal
}

/**
 * A single structured, exact-match edit within a file — the format a model is asked
 * to author. Exact-match-and-replace is far more reliable for an LLM to produce
 * correctly than a unified diff (no line numbers or context hunks to get right); the
 * host applies it by locating `oldString` verbatim and refusing (surfacing the exact
 * mismatch back to the model) if the match isn't unique. See ROADMAP.md, Phase 1.
 */
export interface StructuredEdit {
  oldString: string
  newString: string
}

/** What an agent returns from a phase. */
export interface PhaseResult {
  /**
   * Files the agent proposes to change. `edits` (structured, exact-match) is the
   * primary format a model authors; `contents` is the fallback for new files or full
   * rewrites; `diff` is display-only — computed for the Review surface after the
   * fact, never something a model is asked to produce directly.
   */
  changes?: { path: string; edits?: StructuredEdit[]; contents?: string; diff?: string }[]
  /** Free-form findings routed into the next Sense by the courier. */
  memo?: string
  /** A decision the agent is blocked on and needs a human to resolve. */
  conflict?: { title: string; question: string; options: { id: string; label: string }[] }
  notes?: string
}

/**
 * The seam a transport implements. An MCP adapter, an HTTP adapter and a
 * local-process adapter each satisfy this — the core only ever sees `serve`.
 */
export interface AgentAdapter {
  readonly manifest: AgentManifest
  /** Run one phase and return a proposed change / memo / conflict. */
  serve(req: PhaseRequest, deps: { provider?: LlmProvider; profile?: ModelProfile }): Promise<PhaseResult>
  /** Optional readiness probe (endpoint reachable, model available). */
  health?(): Promise<{ ok: boolean; detail?: string }>
}
