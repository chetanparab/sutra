import { useEffect, useMemo, useReducer } from 'react'
import { SIGNALS } from '../scenario'
import {
  LOOP_CONFLICT,
  PHASES,
  SIGNAL_ORDER,
  actionsFor,
  makeMemo,
  signalOutcome,
  signalValue,
} from './script'
import {
  PHASE_ORDER,
  type Autonomy,
  type LoopConfig,
  type LoopEvent,
  type LoopPhase,
  type LoopState,
  type SignalState,
} from './types'

const TICK_MS = 200

export const AUTONOMY_GATES: Record<Autonomy, LoopConfig['gates']> = {
  copilot: { onConflict: true, beforeIteration: true, onConvergence: true },
  guided: { onConflict: true, beforeIteration: false, onConvergence: false },
  autopilot: { onConflict: false, beforeIteration: false, onConvergence: false },
}

const DEFAULT_CONFIG: LoopConfig = {
  autonomy: 'guided',
  maxIterations: 3,
  gates: { ...AUTONOMY_GATES.guided },
}

function jitter(ms: number): number {
  return Math.round(ms * (0.9 + Math.random() * 0.2))
}

function pendingSignals(): SignalState[] {
  return SIGNAL_ORDER.map((id) => {
    const s = SIGNALS.find((x) => x.id === id)!
    return { id, name: s.name, status: 'pending', value: '' }
  })
}

function initial(config: LoopConfig): LoopState {
  return {
    started: false,
    t: 0,
    iteration: 1,
    phase: 'sense',
    phaseElapsed: 0,
    status: 'idle',
    config,
    durations: {
      sense: PHASES[0].baseDuration,
      build: PHASES[1].baseDuration,
      verify: PHASES[2].baseDuration,
      reflect: PHASES[3].baseDuration,
    },
    signals: pendingSignals(),
    memos: [],
    history: [],
    decisions: [],
    events: [],
    conflictResolved: false,
    pendingGate: null,
  }
}

const conflictAutoResolves = (c: LoopConfig) => c.autonomy === 'autopilot'

function withEvent(s: LoopState, kind: LoopEvent['kind'], label: string, tone: LoopEvent['tone']): LoopState {
  return { ...s, events: [...s.events, { t: s.t, kind, label, tone }] }
}

// Reveal signals progressively across the Verify phase so convergence is felt.
function verifySignals(iteration: number, fraction: number): SignalState[] {
  const revealed = Math.min(SIGNAL_ORDER.length, Math.floor(fraction * (SIGNAL_ORDER.length + 0.5)))
  return SIGNAL_ORDER.map((id, i) => {
    const s = SIGNALS.find((x) => x.id === id)!
    if (i >= revealed) return { id, name: s.name, status: 'pending', value: '' }
    return { id, name: s.name, status: signalOutcome(id, iteration), value: signalValue(id, iteration) }
  })
}

function finalSignals(iteration: number): SignalState[] {
  return SIGNAL_ORDER.map((id) => {
    const s = SIGNALS.find((x) => x.id === id)!
    return { id, name: s.name, status: signalOutcome(id, iteration), value: signalValue(id, iteration) }
  })
}

function greenCount(iteration: number): number {
  return SIGNAL_ORDER.filter((id) => signalOutcome(id, iteration) === 'pass').length
}

type Action =
  | { type: 'launch'; config: LoopConfig }
  | { type: 'reset'; config: LoopConfig }
  | { type: 'tick'; dt: number }
  | { type: 'resolveConflict'; optionId: string }
  | { type: 'approveGate' }
  | { type: 'extend' }
  | { type: 'acceptPartial' }

function startIteration(s: LoopState, n: number): LoopState {
  return withEvent(
    {
      ...s,
      iteration: n,
      phase: 'sense',
      phaseElapsed: 0,
      status: 'running',
      signals: pendingSignals(),
      durations: {
        sense: jitter(PHASES[0].baseDuration),
        build: jitter(PHASES[1].baseDuration),
        verify: jitter(PHASES[2].baseDuration),
        reflect: jitter(PHASES[3].baseDuration),
      },
    },
    'iteration',
    `Iteration ${n}`,
    'accent',
  )
}

function enterPhase(s: LoopState, phase: LoopPhase): LoopState {
  return {
    ...s,
    phase,
    phaseElapsed: 0,
    signals: phase === 'verify' ? pendingSignals() : s.signals,
  }
}

// End of a phase → decide what happens next.
function advance(s: LoopState): LoopState {
  const idx = PHASE_ORDER.indexOf(s.phase)

  // Build complete on the first iteration: the enforcement-boundary decision.
  if (s.phase === 'build' && s.iteration === 1 && !s.conflictResolved) {
    if (conflictAutoResolves(s.config)) {
      const opt = LOOP_CONFLICT.options.find((o) => o.recommended)!
      return enterPhase(
        withEvent(
          {
            ...s,
            conflictResolved: true,
            decisions: [...s.decisions, { at: s.t, text: opt.decision.text, reason: opt.decision.reason, auto: true }],
          },
          'decision',
          'Auto-resolved · shared executor',
          'accent',
        ),
        'verify',
      )
    }
    if (s.config.gates.onConflict) {
      return withEvent({ ...s, status: 'conflict' }, 'conflict', 'Conflict · two retry paths', 'warn')
    }
    // gate off but not autopilot → proceed silently
    return enterPhase({ ...s, conflictResolved: true }, 'verify')
  }

  if (s.phase === 'verify') {
    const green = greenCount(s.iteration)
    return enterPhase(
      withEvent({ ...s, signals: finalSignals(s.iteration) }, 'verify', `Verify · ${green}/${SIGNAL_ORDER.length} green`, green === SIGNAL_ORDER.length ? 'ok' : 'warn'),
      'reflect',
    )
  }

  if (s.phase === 'reflect') {
    return closeIteration(s)
  }

  return enterPhase(s, PHASE_ORDER[idx + 1])
}

function closeIteration(s: LoopState): LoopState {
  const green = greenCount(s.iteration)
  const total = SIGNAL_ORDER.length
  const converged = green === total
  const memo = makeMemo(s.memos.length + 1, s.iteration, converged)
  const history = [...s.history, { n: s.iteration, green, total, converged }]
  const memos = [...s.memos, memo]
  const base = withEvent({ ...s, history, memos }, 'memo', `Hermes memo #${memo.id}`, converged ? 'ok' : 'accent')

  if (converged) {
    if (s.config.gates.onConvergence) {
      return { ...base, status: 'gate', pendingGate: 'converge' }
    }
    return withEvent({ ...base, status: 'converged' }, 'converge', 'Converged · 5/5', 'ok')
  }
  if (s.iteration < s.config.maxIterations) {
    if (s.config.gates.beforeIteration) {
      return { ...base, status: 'gate', pendingGate: 'next-iteration' }
    }
    return startIteration(base, s.iteration + 1)
  }
  return withEvent({ ...base, status: 'exhausted' }, 'exhausted', 'Budget spent', 'warn')
}

function reducer(state: LoopState, action: Action): LoopState {
  switch (action.type) {
    case 'launch':
      return startIteration({ ...initial(action.config), started: true }, 1)
    case 'reset':
      return initial(action.config)

    case 'tick': {
      if (state.status !== 'running') return state
      const t = state.t + action.dt
      const phaseElapsed = state.phaseElapsed + action.dt
      const dur = state.durations[state.phase]
      let next: LoopState = { ...state, t, phaseElapsed }
      if (state.phase === 'verify') {
        next = { ...next, signals: verifySignals(state.iteration, Math.min(1, phaseElapsed / dur)) }
      }
      if (phaseElapsed >= dur) return advance(next)
      return next
    }

    case 'resolveConflict': {
      if (state.status !== 'conflict') return state
      const opt = LOOP_CONFLICT.options.find((o) => o.id === action.optionId)
      if (!opt) return state
      return enterPhase(
        withEvent(
          {
            ...state,
            status: 'running',
            conflictResolved: true,
            decisions: [
              ...state.decisions,
              { at: state.t, text: opt.decision.text, reason: opt.decision.reason, human: true },
            ],
          },
          'decision',
          `You chose · ${opt.id === 'shared' ? 'shared executor' : 'v2 only'}`,
          'accent',
        ),
        'verify',
      )
    }

    case 'approveGate': {
      if (state.status !== 'gate') return state
      if (state.pendingGate === 'converge') return withEvent({ ...state, status: 'converged', pendingGate: null }, 'converge', 'Converged · 5/5', 'ok')
      const s = { ...state, pendingGate: null }
      return startIteration(s, state.iteration + 1)
    }

    case 'extend': {
      if (state.status !== 'exhausted') return state
      const config = { ...state.config, maxIterations: state.config.maxIterations + 1 }
      const s = {
        ...state,
        config,
        decisions: [
          ...state.decisions,
          { at: state.t, text: 'Extended the loop budget by +1 iteration', reason: 'signals had not converged', human: true },
        ],
      }
      return startIteration(s, state.iteration + 1)
    }

    case 'acceptPartial': {
      if (state.status !== 'exhausted') return state
      return withEvent(
        {
          ...state,
          status: 'accepted',
          decisions: [
            ...state.decisions,
            {
              at: state.t,
              text: 'Accepted at 4 / 5 with a known p99 gap',
              reason: 'iteration budget spent; shipping behind the flag with the gap logged',
              human: true,
            },
          ],
        },
        'converge',
        'Accepted · 4/5',
        'warn',
      )
    }
  }
}

export interface Loop {
  state: LoopState
  ready: boolean // exited to review (converged or accepted)
  phaseFraction: number
  activeAgents: string[]
  actionLine: string
  conflict: typeof LOOP_CONFLICT | null
  launch: (config: LoopConfig) => void
  reset: () => void
  resolveConflict: (optionId: string) => void
  approveGate: () => void
  extend: () => void
  acceptPartial: () => void
}

export function useLoop(): Loop {
  const [state, dispatch] = useReducer(reducer, DEFAULT_CONFIG, initial)

  useEffect(() => {
    if (state.status !== 'running') return
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const dt = Math.min(1500, now - last)
      last = now
      dispatch({ type: 'tick', dt })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [state.status])

  const phaseFraction = useMemo(
    () => Math.min(1, state.phaseElapsed / state.durations[state.phase]),
    [state.phaseElapsed, state.durations, state.phase],
  )

  const activeAgents = useMemo(() => PHASES.find((p) => p.id === state.phase)?.agents ?? [], [state.phase])

  const actionLine = useMemo(() => {
    if (state.status === 'idle') return 'Loop not launched'
    if (state.status === 'conflict') return LOOP_CONFLICT.title
    if (state.status === 'gate')
      return state.pendingGate === 'converge' ? 'Awaiting sign-off to exit' : 'Awaiting sign-off for the next iteration'
    if (state.status === 'converged' || state.status === 'accepted') return 'Loop closed — handed to Review'
    if (state.status === 'exhausted') return 'Iteration budget spent without convergence'
    const lines = actionsFor(state.phase, state.iteration)
    const i = Math.floor(state.phaseElapsed / 2000) % lines.length
    return lines[i]
  }, [state.status, state.phase, state.iteration, state.phaseElapsed, state.pendingGate])

  return {
    state,
    ready: state.status === 'converged' || state.status === 'accepted',
    phaseFraction,
    activeAgents,
    actionLine,
    conflict: state.status === 'conflict' ? LOOP_CONFLICT : null,
    launch: (config) => dispatch({ type: 'launch', config }),
    reset: () => dispatch({ type: 'reset', config: DEFAULT_CONFIG }),
    resolveConflict: (optionId) => dispatch({ type: 'resolveConflict', optionId }),
    approveGate: () => dispatch({ type: 'approveGate' }),
    extend: () => dispatch({ type: 'extend' }),
    acceptPartial: () => dispatch({ type: 'acceptPartial' }),
  }
}

export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
