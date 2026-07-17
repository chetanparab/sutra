// Loop engineering core types. A mission is not one pass — it is a designed
// loop (Sense → Build → Verify → Reflect) that iterates until the acceptance
// signals converge or the iteration budget runs out.

export type LoopPhase = 'sense' | 'build' | 'verify' | 'reflect'

export const PHASE_ORDER: LoopPhase[] = ['sense', 'build', 'verify', 'reflect']

export type LoopStatus =
  | 'idle' // designing, not launched
  | 'running' // a phase is executing
  | 'conflict' // paused on a human decision
  | 'gate' // paused at a configured human gate
  | 'converged' // all acceptance signals green — loop done
  | 'accepted' // exited with a known gap (budget spent, human accepted)
  | 'exhausted' // hit max iterations without converging

export type Autonomy = 'copilot' | 'guided' | 'autopilot'

export interface LoopGates {
  onConflict: boolean
  beforeIteration: boolean
  onConvergence: boolean
}

export interface LoopConfig {
  autonomy: Autonomy
  maxIterations: number
  gates: LoopGates
}

export type SignalStatus = 'pending' | 'pass' | 'fail'

export interface SignalState {
  id: string
  name: string
  status: SignalStatus
  value: string
}

export interface HermesMemo {
  id: number
  iteration: number
  kind: 'reflect' | 'converge'
  title: string
  finding: string
  directive: string
  routedTo: string
}

export interface IterationRecord {
  n: number
  green: number
  total: number
  converged: boolean
}

export interface LoopDecision {
  at: number
  text: string
  reason: string
  auto?: boolean
  human?: boolean
}

export type PendingGate = 'next-iteration' | 'converge' | null

export type LoopEventKind = 'iteration' | 'phase' | 'conflict' | 'decision' | 'verify' | 'memo' | 'converge' | 'exhausted'
export type EventTone = 'accent' | 'ok' | 'warn' | 'muted'

export interface LoopEvent {
  t: number
  kind: LoopEventKind
  label: string
  tone: EventTone
}

export interface LoopState {
  started: boolean
  t: number
  iteration: number
  phase: LoopPhase
  phaseElapsed: number
  status: LoopStatus
  config: LoopConfig
  durations: Record<LoopPhase, number>
  signals: SignalState[]
  memos: HermesMemo[]
  history: IterationRecord[]
  decisions: LoopDecision[]
  events: LoopEvent[]
  conflictResolved: boolean
  pendingGate: PendingGate
}
