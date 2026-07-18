/**
 * Real mode (ROADMAP.md Phase 3): assembles the engine's live NDJSON stream
 * into the same `Loop` contract the scripted demo produces, so LoopRunView,
 * the orbit, the timeline and the memo rail render a REAL run without
 * changing a line. Where the sim fakes progress with durations, real mode
 * shows an indeterminate sweep — a real phase finishes when it finishes.
 *
 * Deliberate v1 boundaries (recorded, not hidden):
 * - No mid-run gates or conflicts in real mode yet; autonomy is effectively
 *   'guided'. The sim's conflict theater stays in the demo.
 * - Abort / guardrail outcomes surface via the flight recorder and the action
 *   line; the status maps onto 'exhausted' (closest existing UI state) with
 *   the honest label carried by the events themselves.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  startRealLoop,
  type EngineOutcome,
  type RealLoopArgs,
  type RealLoopHandle,
} from '../desktop/realLoop'
import type { HermesMemo, IterationRecord, LoopEvent, LoopPhase, LoopState, SignalState } from './types'
import type { Loop } from './useLoop'

export interface RealRunMeta {
  workspacePath: string
  verifyCmd: string
  branchName: string | null
  diff: string | null
  outcome: EngineOutcome | null
  logs: string[]
  /** Set when loop_start itself failed (spawn error, second loop, bad args). */
  launchError: string | null
}

export interface RealLoopController {
  /** The Loop contract — hand this to LoopRunView and the existing surfaces render the real run. */
  loop: Loop
  meta: RealRunMeta
  running: boolean
  launch: (args: RealLoopArgs) => Promise<void>
  abort: () => Promise<void>
  reset: () => void
}

const PHASE_BY_LABEL: Record<string, LoopPhase> = { Build: 'build', Verify: 'verify', Reflect: 'reflect' }

interface StreamAccum {
  events: LoopEvent[]
  memos: HermesMemo[]
  iteration: number
  phase: LoopPhase
  history: IterationRecord[]
  verify: { status: 'pending' | 'pass' | 'fail'; detail: string }
  status: LoopState['status']
  outcome: EngineOutcome | null
}

const emptyAccum = (): StreamAccum => ({
  events: [],
  memos: [],
  iteration: 0,
  phase: 'sense',
  history: [],
  verify: { status: 'pending', detail: 'not yet run' },
  status: 'idle',
  outcome: null,
})

export function useRealLoop(): RealLoopController {
  const [accum, setAccum] = useState<StreamAccum>(emptyAccum)
  const [meta, setMeta] = useState<RealRunMeta>({ workspacePath: '', verifyCmd: '', branchName: null, diff: null, outcome: null, logs: [], launchError: null })
  const [maxIterations, setMaxIterations] = useState(3)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const handleRef = useRef<RealLoopHandle | null>(null)

  // A liveness clock for t / the indeterminate sweep — 500ms is smooth enough
  // for a wall-clock readout and cheap enough to run for a whole real build.
  useEffect(() => {
    if (startedAt === null || accum.status !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [startedAt, accum.status])

  const ingestEvent = useCallback((event: LoopEvent) => {
    setAccum((prev) => {
      const next: StreamAccum = { ...prev, events: [...prev.events, event] }
      if (event.kind === 'iteration') {
        next.iteration = prev.iteration + 1
        next.phase = 'sense'
      } else if (event.kind === 'phase') {
        // Labels may carry a qualifier, e.g. "Verify (container)" — key off the
        // first word so the orbit still lands on the right phase.
        next.phase = PHASE_BY_LABEL[event.label.split(' ')[0]] ?? prev.phase
      } else if (event.kind === 'verify') {
        const passed = event.tone === 'ok'
        next.verify = { status: passed ? 'pass' : 'fail', detail: event.label.replace('Verify · ', '') }
        next.history = [...prev.history, { n: next.iteration, green: passed ? 1 : 0, total: 1, converged: passed }]
      } else if (event.kind === 'converge') {
        next.status = 'converged'
      } else if (event.kind === 'exhausted') {
        // Budget spent, guardrail tripped or aborted — the event label says
        // which; 'exhausted' is the UI state that renders a stopped loop.
        next.status = 'exhausted'
      }
      return next
    })
  }, [])

  const launch = useCallback(async (args: RealLoopArgs) => {
    handleRef.current?.dispose()
    setAccum({ ...emptyAccum(), status: 'running' })
    setMeta({ workspacePath: args.workspacePath, verifyCmd: args.verifyCmd, branchName: null, diff: null, outcome: null, logs: [], launchError: null })
    setMaxIterations(args.maxIterations)
    setStartedAt(Date.now())
    setNow(Date.now())

    try {
      handleRef.current = await startRealLoop(args, {
        onEvent: ingestEvent,
        onMemo: (memo) => setAccum((prev) => ({ ...prev, memos: [...prev.memos, memo] })),
        onOutcome: (outcome) =>
          setMeta((prev) => ({ ...prev, outcome, branchName: outcome.branchName, diff: outcome.diff ?? null })),
        // A clean, structured setup error (not a git repo, missing key, …):
        // stop the loop and take the user back to the launch panel with the
        // real message — not a mystery 'exited unexpectedly'.
        onError: (message) => {
          setMeta((prev) => ({ ...prev, launchError: message }))
          setAccum((prev) => ({ ...prev, status: 'idle' }))
          setStartedAt(null)
        },
        onLog: (line) => setMeta((prev) => ({ ...prev, logs: [...prev.logs.slice(-199), line] })),
        onExit: () =>
          setAccum((prev) =>
            prev.status === 'running'
              ? // The engine died without a converge/exhausted/error line (a
                // real crash or kill): honest stopped state, and surface the
                // last stderr line so it isn't a blank mystery.
                {
                  ...prev,
                  status: 'exhausted',
                  events: [...prev.events, { t: Date.now(), kind: 'exhausted', label: 'The engine stopped unexpectedly', tone: 'warn' }],
                }
              : prev,
          ),
      })
    } catch (err) {
      handleRef.current = null
      setAccum((prev) => ({ ...prev, status: 'idle' }))
      setStartedAt(null)
      setMeta((prev) => ({ ...prev, launchError: err instanceof Error ? err.message : String(err) }))
      throw err
    }
  }, [ingestEvent])

  const abort = useCallback(async () => {
    await handleRef.current?.abort()
  }, [])

  const reset = useCallback(() => {
    handleRef.current?.dispose()
    handleRef.current = null
    setAccum(emptyAccum())
    setMeta({ workspacePath: '', verifyCmd: '', branchName: null, diff: null, outcome: null, logs: [], launchError: null })
    setStartedAt(null)
  }, [])

  useEffect(() => () => handleRef.current?.dispose(), [])

  const elapsed = startedAt === null ? 0 : Math.max(0, now - startedAt)

  const signals: SignalState[] = useMemo(
    () => [
      {
        id: 'verify-cmd',
        name: meta.verifyCmd || 'verify command',
        status: accum.verify.status,
        value: accum.verify.detail,
      },
    ],
    [meta.verifyCmd, accum.verify],
  )

  const state: LoopState = useMemo(
    () => ({
      started: startedAt !== null,
      t: elapsed,
      iteration: Math.max(1, accum.iteration),
      phase: accum.phase,
      phaseElapsed: 0,
      status: accum.status === 'idle' && startedAt !== null ? 'running' : accum.status,
      config: { autonomy: 'guided', maxIterations, gates: { onConflict: true, beforeIteration: false, onConvergence: false } },
      durations: { sense: 1, build: 1, verify: 1, reflect: 1 },
      signals,
      memos: accum.memos,
      history: accum.history,
      decisions: [],
      events: accum.events,
      conflictResolved: true,
      pendingGate: null,
    }),
    [accum, startedAt, elapsed, maxIterations, signals],
  )

  // The indeterminate sweep: a slow 3s cycle on the active phase's arc. Real
  // phases have no knowable duration — motion signals "alive", not progress.
  const phaseFraction = accum.status === 'running' ? (elapsed % 3000) / 3000 : 1

  const actionLine = useMemo(() => {
    if (accum.status === 'converged') return 'Loop closed — review the real diff'
    if (accum.status === 'exhausted') return accum.events.at(-1)?.label ?? 'Loop stopped'
    if (startedAt === null) return 'Loop not launched'
    const phaseLine: Record<LoopPhase, string> = {
      sense: 'Reading the repo and the courier memo',
      build: 'The model is proposing real edits',
      verify: `Running your command: ${meta.verifyCmd}`,
      reflect: 'Turning the failure into a directive',
    }
    return phaseLine[accum.phase]
  }, [accum.status, accum.phase, accum.events, startedAt, meta.verifyCmd])

  const ready = accum.status === 'converged'

  const loop: Loop = useMemo(
    () => ({
      state,
      ready,
      phaseFraction,
      activeAgents: [],
      actionLine,
      conflict: null,
      // The Loop contract's sim-side actions: launch/reset are owned by the
      // real controller (the design surface calls those), and real mode has
      // no mid-run gates yet — inert by design, not by accident.
      launch: () => {},
      reset: () => {},
      phaseComplete: () => {},
      resolveConflict: () => {},
      approveGate: () => {},
      extend: () => {},
      acceptPartial: () => {},
    }),
    [state, ready, phaseFraction, actionLine],
  )

  return { loop, meta, running: accum.status === 'running', launch, abort, reset }
}
