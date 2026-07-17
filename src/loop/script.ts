import { SIGNALS } from '../scenario'
import type { HermesMemo, LoopPhase } from './types'

// ── Loop shape ──────────────────────────────────────────────────────────

export interface PhaseDef {
  id: LoopPhase
  label: string
  blurb: string
  agents: string[]
  baseDuration: number
}

export const PHASES: PhaseDef[] = [
  {
    id: 'sense',
    label: 'Sense',
    blurb: 'Read live context + last loop’s memo, scope the delta',
    agents: ['scout'],
    baseDuration: 3200,
  },
  {
    id: 'build',
    label: 'Build',
    blurb: 'Implement against the acceptance signals in parallel',
    agents: ['builder-a', 'builder-b'],
    baseDuration: 4200,
  },
  {
    id: 'verify',
    label: 'Verify',
    blurb: 'Run signals + policy — machine-checkable, not prose',
    agents: ['verifier', 'sentinel'],
    baseDuration: 3600,
  },
  {
    id: 'reflect',
    label: 'Reflect',
    blurb: 'Hermes weighs the gap and routes the next directive',
    agents: ['hermes'],
    baseDuration: 2600,
  },
]

export const LOOP_AGENTS: Record<string, { name: string; role: string }> = {
  scout: { name: 'Scout', role: 'context' },
  'builder-a': { name: 'Builder A', role: 'store & retry paths' },
  'builder-b': { name: 'Builder B', role: 'api surface' },
  verifier: { name: 'Verifier', role: 'tests & evals' },
  sentinel: { name: 'Sentinel', role: 'policy' },
  hermes: { name: 'Hermes', role: 'loop courier' },
}

// ── Per-iteration, per-phase live action lines ──────────────────────────

const ACTIONS: Record<LoopPhase, { first: string[]; later: string[] }> = {
  sense: {
    first: ['Indexing the payment-retry call graph…', 'Reading the INC-4112 postmortem…'],
    later: ['Hermes memo #1 received — applying the p99 directive', 'Re-scoping to the hot-path round-trip…'],
  },
  build: {
    first: ['Scaffolding IdempotencyKeyStore (SETNX, TTL 24h)…', 'Threading the key through both retry paths…'],
    later: ['Pipelining checkAndSet with authorize()…', 'Dropping the pre-auth Redis GET…'],
  },
  verify: {
    first: ['Replaying 1,000 duplicate retries…', 'Perf smoke on the retry hot path…'],
    later: ['Re-running perf smoke on the hot path…', 'Racing SETNX under 64-way concurrency…'],
  },
  reflect: {
    first: ['Hermes weighing 4 / 5 signals…', 'Drafting the fix directive…'],
    later: ['Hermes confirming convergence…', 'Sealing the evidence bundle…'],
  },
}

export function actionsFor(phase: LoopPhase, iteration: number): string[] {
  return iteration <= 1 ? ACTIONS[phase].first : ACTIONS[phase].later
}

// ── Signal outcomes per iteration ───────────────────────────────────────
// The p99 signal blows its budget on the first pass — that is the drama the
// loop exists to resolve. Every later iteration converges.

export function signalOutcome(id: string, iteration: number): 'pass' | 'fail' {
  if (id === 'p99-overhead' && iteration <= 1) return 'fail'
  return 'pass'
}

export function signalValue(id: string, iteration: number): string {
  if (id === 'p99-overhead') {
    return iteration <= 1 ? '+7.2ms p99 · over 5ms budget' : '+3.1ms p99 @ 40K TPS replay'
  }
  return SIGNALS.find((s) => s.id === id)?.result ?? ''
}

// Reveal order during Verify (p99 lands late for tension).
export const SIGNAL_ORDER = ['dup-suppress', 'baseline-compat', 'ttl-24h', 'p99-overhead', 'no-pii']

// ── Hermes memos ────────────────────────────────────────────────────────

export function makeMemo(id: number, iteration: number, converged: boolean): HermesMemo {
  if (converged) {
    return {
      id,
      iteration,
      kind: 'converge',
      title: 'Converged — 5 / 5 signals green',
      finding:
        'p99 overhead now +3.1ms against a 5ms budget. Every acceptance signal holds across the 1,000-replay ' +
        'suite and the 64-way SETNX race.',
      directive: 'Exit the loop. Hand the evidence bundle to Review.',
      routedTo: 'Review',
    }
  }
  return {
    id,
    iteration,
    kind: 'reflect',
    title: 'p99 over budget on the retry hot path',
    finding:
      'checkAndSet issues a synchronous Redis GET before authorize(); +7.2ms p99 at 40K TPS replay, over the ' +
      '5ms budget. The other four signals are green.',
    directive: 'Drop the pre-auth GET — rely on the SETNX result and pipeline it with charge auth. Re-run perf smoke.',
    routedTo: 'Sense · Builder A',
  }
}

// ── The one human decision inside the loop ──────────────────────────────

export interface LoopConflictOption {
  id: string
  label: string
  detail: string
  recommended?: boolean
  decision: { text: string; reason: string }
}

export interface LoopConflict {
  title: string
  body: string
  options: LoopConflictOption[]
}

export const LOOP_CONFLICT: LoopConflict = {
  title: 'Two live retry paths',
  body:
    'RetryQueue (legacy v1) still serves 12.4% of retries via mobile SDK ≤ 4.2. Keying only the v2 orchestrator ' +
    'leaves v1 exposed to an INC-4112 recurrence. Where should enforcement live?',
  options: [
    {
      id: 'shared',
      label: 'Enforce at the shared RetryExecutor',
      detail: '+2 files · covers v1 + v2 · one choke point',
      recommended: true,
      decision: {
        text: 'Enforce at the shared RetryExecutor.execute()',
        reason: 'covers 100% of retries through one auditable choke point',
      },
    },
    {
      id: 'v2-only',
      label: 'v2 only · tag v1 with unkeyed-retry telemetry',
      detail: '+1 file · 12.4% of retries stay unkeyed',
      decision: {
        text: 'v2-only enforcement; tag v1 with unkeyed-retry telemetry',
        reason: 'accepts residual risk until the mobile SDK ≤ 4.2 sunsets',
      },
    },
  ],
}
