export type AgentStatus = 'queued' | 'running' | 'blocked' | 'needs-review' | 'done'

export interface DecisionSeed {
  text: string
  reason: string
  warn?: boolean
  human?: boolean
}

export interface Decision extends DecisionSeed {
  at: number // sim time ms
}

export interface ConflictOption {
  id: string
  label: string
  detail: string
  recommended?: boolean
  extraFiles: number
  decision: DecisionSeed
}

export interface ConflictDef {
  title: string
  body: string
  options: ConflictOption[]
}

export type Step =
  | {
      kind: 'work'
      actions: string[] // live one-liners, cycled while the step runs
      duration: number // ms (jittered at run start)
      filesDelta?: number
      confidenceTo?: number // 0..1 target reached by step end
      decision?: DecisionSeed
    }
  | { kind: 'conflict'; conflict: ConflictDef }

export interface AgentDef {
  id: string
  name: string
  role: string
  glyph: string
  wave: 1 | 2 | 3
  filesVerb: 'touched' | 'read' | 'checked'
  queuedLine: string
  startAfter: { id: string; reaches: 'done' | 'needs-review' }[]
  startDelay: number // ms after dependencies are met
  steps: Step[]
  terminal: 'done' | 'needs-review'
  terminalNote: string
}

export interface AgentRt {
  def: AgentDef
  status: AgentStatus
  readyAt: number | null
  startedAt: number | null
  endedAt: number | null
  stepIdx: number
  stepStartedAt: number
  files: number
  confidence: number
  decisions: Decision[]
  conflict: ConflictDef | null
}

export interface SimState {
  started: boolean
  t: number // sim time ms since dispatch
  agents: AgentRt[]
}

export type SimPhase = 'idle' | 'flight' | 'input' | 'ready'

export type SimAction =
  | { type: 'start'; agents: AgentRt[] }
  | { type: 'tick'; dt: number }
  | { type: 'resolve'; agentId: string; optionId: string }
