/**
 * Sutra's "bring your own" contracts — the seams between the loop (ours) and the
 * intelligence + models (yours). See ./README.md and ../../ARCHITECTURE.md.
 */
export type {
  AgentAdapter,
  AgentManifest,
  AgentRole,
  AgentTransport,
  Capability,
  LoopPhase,
  PhaseRequest,
  PhaseResult,
} from './agent'
export type {
  ChatMessage,
  Completion,
  GenOpts,
  LlmProvider,
  ModelProfile,
  Role,
  ToolCall,
  ToolDef,
  Usage,
} from './llm'
export { AgentRegistry, ProviderRegistry } from './registry'
export { simulatedBuilder, simulatedProvider } from './simulated'
