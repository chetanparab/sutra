import { useEffect, useMemo, useReducer } from 'react'
import { AGENT_DEFS } from './script'
import type { AgentRt, AgentStatus, SimPhase, SimState } from './types'

const TICK_MS = 200

function jitter(ms: number): number {
  return Math.round(ms * (0.85 + Math.random() * 0.3))
}

export function buildRuntimes(): AgentRt[] {
  return AGENT_DEFS.map((def) => ({
    def: {
      ...def,
      steps: def.steps.map((s) => (s.kind === 'work' ? { ...s, duration: jitter(s.duration) } : s)),
    },
    status: 'queued',
    readyAt: null,
    startedAt: null,
    endedAt: null,
    stepIdx: 0,
    stepStartedAt: 0,
    files: 0,
    confidence: 0,
    decisions: [],
    conflict: null,
  }))
}

function depSatisfied(status: AgentStatus | undefined, reaches: 'done' | 'needs-review'): boolean {
  if (!status) return false
  if (reaches === 'done') return status === 'done'
  return status === 'needs-review' || status === 'done'
}

function approach(current: number, target: number, dt: number): number {
  return current + (target - current) * Math.min(1, dt / 1500)
}

function tick(state: SimState, dt: number): SimState {
  if (!state.started) return state
  const t = state.t + dt
  const prevStatus = new Map(state.agents.map((a) => [a.def.id, a.status]))

  const agents = state.agents.map((a): AgentRt => {
    if (a.status === 'queued') {
      const depsMet = a.def.startAfter.every((d) => depSatisfied(prevStatus.get(d.id), d.reaches))
      let readyAt = a.readyAt
      if (depsMet && readyAt === null) readyAt = t + a.def.startDelay
      if (readyAt !== null && t >= readyAt) {
        return { ...a, readyAt, status: 'running', startedAt: t, stepStartedAt: t, confidence: 0.18 }
      }
      return readyAt !== a.readyAt ? { ...a, readyAt } : a
    }

    if (a.status === 'running') {
      const step = a.def.steps[a.stepIdx]
      if (!step || step.kind !== 'work') return a
      let confidence = a.confidence
      if (step.confidenceTo !== undefined) confidence = approach(confidence, step.confidenceTo, dt)

      if (t >= a.stepStartedAt + step.duration) {
        const decisions = step.decision ? [...a.decisions, { ...step.decision, at: t }] : a.decisions
        const files = a.files + (step.filesDelta ?? 0)
        const conf = step.confidenceTo ?? confidence
        const nextIdx = a.stepIdx + 1
        const next = a.def.steps[nextIdx]
        if (!next) {
          return { ...a, status: a.def.terminal, endedAt: t, stepIdx: nextIdx, decisions, files, confidence: conf }
        }
        if (next.kind === 'conflict') {
          return {
            ...a,
            status: 'blocked',
            conflict: next.conflict,
            stepIdx: nextIdx,
            decisions,
            files,
            confidence: Math.min(conf, 0.55),
          }
        }
        return { ...a, stepIdx: nextIdx, stepStartedAt: t, decisions, files, confidence: conf }
      }
      return { ...a, confidence }
    }

    return a
  })

  return { ...state, t, agents }
}

function resolve(state: SimState, agentId: string, optionId: string): SimState {
  const agents = state.agents.map((a): AgentRt => {
    if (a.def.id !== agentId || a.status !== 'blocked' || !a.conflict) return a
    const option = a.conflict.options.find((o) => o.id === optionId)
    if (!option) return a
    return {
      ...a,
      status: 'running',
      conflict: null,
      stepIdx: a.stepIdx + 1, // consume the conflict step
      stepStartedAt: state.t,
      files: a.files + option.extraFiles,
      confidence: 0.6,
      decisions: [...a.decisions, { ...option.decision, at: state.t }],
    }
  })
  return { ...state, agents }
}

type SimAction =
  | { type: 'start'; agents: AgentRt[] }
  | { type: 'reset'; agents: AgentRt[] }
  | { type: 'tick'; dt: number }
  | { type: 'resolve'; agentId: string; optionId: string }

function reducer(state: SimState, action: SimAction): SimState {
  switch (action.type) {
    case 'start':
      return { started: true, t: 0, agents: action.agents }
    case 'reset':
      return { started: false, t: 0, agents: action.agents }
    case 'tick':
      return tick(state, action.dt)
    case 'resolve':
      return resolve(state, action.agentId, action.optionId)
  }
}

export interface Sim {
  state: SimState
  phase: SimPhase
  wave: number
  start: () => void
  reset: () => void
  resolveConflict: (agentId: string, optionId: string) => void
}

export function useSimulation(): Sim {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    started: false,
    t: 0,
    agents: buildRuntimes(),
  }))

  const phase: SimPhase = useMemo(() => {
    if (!state.started) return 'idle'
    if (state.agents.some((a) => a.status === 'blocked')) return 'input'
    const terminal = state.agents.every((a) => a.status === 'done' || a.status === 'needs-review')
    return terminal ? 'ready' : 'flight'
  }, [state])

  // Tick while running; stop once every agent reached a terminal state.
  // dt is measured from the wall clock so throttled timers (background tabs)
  // slow the animation, not the mission.
  useEffect(() => {
    if (!state.started || phase === 'ready') return
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const dt = Math.min(1500, now - last)
      last = now
      dispatch({ type: 'tick', dt })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [state.started, phase])

  const wave = useMemo(() => {
    const active = state.agents.filter((a) => a.status === 'running' || a.status === 'blocked')
    if (active.length > 0) return Math.max(...active.map((a) => a.def.wave))
    if (phase === 'ready') return 3
    const started = state.agents.filter((a) => a.startedAt !== null)
    return started.length > 0 ? Math.max(...started.map((a) => a.def.wave)) : 1
  }, [state, phase])

  return {
    state,
    phase,
    wave,
    start: () => dispatch({ type: 'start', agents: buildRuntimes() }),
    reset: () => dispatch({ type: 'reset', agents: buildRuntimes() }),
    resolveConflict: (agentId, optionId) => dispatch({ type: 'resolve', agentId, optionId }),
  }
}

export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
