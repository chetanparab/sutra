import { ArrowRight, Check, Compass, Feather, FlaskConical, Hammer, Loader2, Plus, Radio, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import Boundary from '../components/Boundary'
import CodeSurface from '../components/CodeSurface'
import LoopOrbit from '../components/LoopOrbit'
import LoopTimeline from '../components/LoopTimeline'
import WasmVerify from '../components/WasmVerify'
import { Button, Chip, Label, Slab, cn } from '../components/ui'
import { LOOP_AGENTS } from '../loop/script'
import type { HermesMemo, SignalState } from '../loop/types'
import type { Loop } from '../loop/useLoop'

const AGENT_ICON: Record<string, typeof Compass> = {
  scout: Compass,
  'builder-a': Hammer,
  'builder-b': Hammer,
  verifier: FlaskConical,
  sentinel: ShieldCheck,
  hermes: Feather,
}

function SignalRow({ s }: { s: SignalState }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      {s.status === 'pass' ? (
        <span className="mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-ok/16 ring-1 ring-ok/35">
          <Check size={11} strokeWidth={3} className="text-ok" />
        </span>
      ) : s.status === 'fail' ? (
        <span className="mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-err/16 ring-1 ring-err/45">
          <X size={11} strokeWidth={3} className="text-err" />
        </span>
      ) : (
        <span className="mt-0.5 h-[19px] w-[19px] shrink-0 rounded-full border border-primary/20" />
      )}
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[13px] leading-snug', s.status === 'pending' ? 'text-muted' : 'text-primary')}>{s.name}</span>
        {s.value && (
          <span className={cn('mt-0.5 block font-mono text-[11px] tnum', s.status === 'fail' ? 'text-err' : 'text-muted')}>{s.value}</span>
        )}
      </span>
    </div>
  )
}

function Transmission({ memo }: { memo: HermesMemo }) {
  const converge = memo.kind === 'converge'
  return (
    <div className={cn('anim-rise surface-2 rounded-[var(--radius)] border p-3', converge ? 'border-ok/25' : 'border-primary/8')}>
      <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-muted">
        <Feather size={12} className={converge ? 'text-ok' : 'text-accent'} />
        <span className={converge ? 'text-ok' : 'text-accent'}>HERMES</span>
        <span>· {String(memo.id).padStart(2, '0')} · ITER {memo.iteration}</span>
      </div>
      <div className="mt-1.5 text-[12.5px] font-medium text-primary">{memo.title}</div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-secondary">{memo.finding}</p>
      <div className="mt-2 flex items-start gap-1.5 rounded-[var(--radius)] bg-primary/[0.05] px-2.5 py-1.5">
        <ArrowRight size={12} className="mt-0.5 shrink-0 text-accent" />
        <span className="text-[11.5px] leading-snug text-primary">{memo.directive}</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-muted">
        <span className="text-faint">route ▸</span> {memo.routedTo}
      </div>
    </div>
  )
}

export default function LoopRunView({ loop, onOpenReview }: { loop: Loop; onOpenReview: () => void }) {
  const { state, phaseFraction, activeAgents, actionLine } = loop
  const paused = state.status === 'conflict' || state.status === 'gate'
  const green = state.signals.filter((s) => s.status === 'pass').length
  const [centerView, setCenterView] = useState<'code' | 'orbit'>('code')

  return (
    <div className="flex min-h-0 flex-1 gap-4 px-6 pb-24 pt-16">
      {/* LEFT — mission */}
      <div className="hidden w-[290px] shrink-0 flex-col gap-3 overflow-y-auto xl:flex">
        <div className="anim-in">
          <Label>Mission</Label>
          <h1 className="serif-hero balance mt-2 font-display text-[19px] font-semibold leading-[1.12] tracking-[-0.02em]">Idempotency keys for the payment retry flow</h1>
          <p className="mt-1.5 font-mono text-[11px] tnum text-muted">INT-0042 · atlas-payments</p>
        </div>

        <Slab title="Loop config" bodyClassName="grid grid-cols-2 gap-y-3.5 gap-x-2">
          <div>
            <div className="label">Autonomy</div>
            <div className="mt-1 font-display text-[13px] font-medium capitalize text-accent">{state.config.autonomy}</div>
          </div>
          <div>
            <div className="label">Budget</div>
            <div className="mt-1 font-display text-[13px] font-medium tnum">{state.config.maxIterations} iters</div>
          </div>
          <div className="col-span-2">
            <div className="label">Human gates</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(['onConflict', 'beforeIteration', 'onConvergence'] as const).filter((g) => state.config.gates[g]).length === 0 ? (
                <span className="text-[11.5px] text-muted">none — full autonomy</span>
              ) : (
                (['onConflict', 'beforeIteration', 'onConvergence'] as const)
                  .filter((g) => state.config.gates[g])
                  .map((g) => <Chip key={g}>{g === 'onConflict' ? 'conflict' : g === 'beforeIteration' ? 'iteration' : 'convergence'}</Chip>)
              )}
            </div>
          </div>
        </Slab>

        <Slab title="Iteration log" bodyClassName="space-y-1.5">
          {state.history.length === 0 && state.status === 'running' ? (
            <p className="text-[11.5px] text-muted">First pass in flight — outcome lands after Verify.</p>
          ) : (
            <>
              {state.history.map((h) => (
                <div key={h.n} className="surface-2 flex items-center gap-2.5 px-2.5 py-2">
                  <span className="font-mono text-[11px] text-muted">#{h.n}</span>
                  <span className={cn('font-display text-[13px] font-medium tnum', h.converged ? 'text-ok' : 'text-warn')}>
                    {h.green}/{h.total}
                  </span>
                  <span className="ml-auto text-[10.5px] text-muted">{h.converged ? 'converged' : 'iterated'}</span>
                </div>
              ))}
              {state.status === 'running' && (
                <div className="flex items-center gap-2.5 rounded-[var(--radius)] border border-accent/20 bg-accent/[0.06] px-2.5 py-2">
                  <span className="font-mono text-[11px] text-muted">#{state.iteration}</span>
                  <Loader2 size={12} className="spin text-accent" />
                  <span className="ml-auto text-[10.5px] text-accent">in flight</span>
                </div>
              )}
            </>
          )}
        </Slab>
      </div>

      {/* CENTER — code / orbit */}
      <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto py-1">
        <div className="flex items-center rounded-full border border-primary/12 bg-primary/[0.03] p-0.5">
          {(['code', 'orbit'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setCenterView(v)}
              className={cn('rounded-full px-4 py-1 text-[12px] font-medium transition-colors', centerView === v ? 'bg-primary/10 text-primary' : 'text-muted hover:text-secondary')}
            >
              {v === 'code' ? 'Code' : 'Orbit'}
            </button>
          ))}
        </div>

        {centerView === 'code' ? (
          <CodeSurface phase={state.phase} iteration={state.iteration} fraction={phaseFraction} status={state.status} />
        ) : (
          <LoopOrbit
            phase={state.phase}
            fraction={phaseFraction}
            iteration={state.iteration}
            maxIterations={state.config.maxIterations}
            status={state.status}
            gates={state.config.gates}
            paused={paused}
            green={green}
            total={state.signals.length}
            memoCount={state.memos.length}
          />
        )}

        <div className="anim-in surface-2 flex w-full max-w-lg items-center gap-3 border border-primary/8 px-4 py-2.5">
          {state.status === 'running' ? (
            <Radio size={14} className="shrink-0 text-accent soft-pulse" />
          ) : loop.ready ? (
            <Check size={14} className="shrink-0 text-ok" />
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full bg-warn soft-pulse" />
          )}
          <span className="min-w-0 flex-1 truncate text-[12px] text-secondary">{actionLine}</span>
          <div className="flex shrink-0 items-center gap-1">
            {activeAgents.map((id) => {
              const Icon = AGENT_ICON[id] ?? Compass
              return (
                <span key={id} title={LOOP_AGENTS[id]?.name} className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/12 ring-1 ring-accent/25">
                  <Icon size={12} className="text-accent" />
                </span>
              )
            })}
          </div>
        </div>

        {state.events.length > 0 && (
          <div className="anim-in flex w-full justify-center">
            <LoopTimeline events={state.events} running={state.status === 'running'} />
          </div>
        )}
      </div>

      {/* RIGHT — decision + convergence + transmissions */}
      <div className="flex w-[336px] shrink-0 flex-col gap-3 overflow-y-auto">
        {loop.conflict && (
          <Slab title="Decision required" bodyClassName="space-y-2.5">
            <p className="text-[12px] leading-relaxed text-secondary">{loop.conflict.body}</p>
            <div className="space-y-2">
              {loop.conflict.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => loop.resolveConflict(opt.id)}
                  className={cn('w-full rounded-[var(--radius)] border p-2.5 text-left transition-all', opt.recommended ? 'border-accent/45 bg-accent/[0.09] hover:bg-accent/15' : 'border-primary/12 hover:border-primary/25')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-medium text-primary">{opt.label}</span>
                    {opt.recommended && <Chip tone="accent">pick</Chip>}
                  </div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-muted">{opt.detail}</div>
                </button>
              ))}
            </div>
          </Slab>
        )}

        {state.status === 'gate' && (
          <Slab title="Human gate" bodyClassName="space-y-3">
            <p className="text-[12px] leading-relaxed text-secondary">
              {state.pendingGate === 'converge' ? 'The loop converged. You asked to sign off before it exits.' : 'You asked to approve the plan before the next iteration.'}
            </p>
            <Button variant="primary" className="w-full" onClick={loop.approveGate}>
              {state.pendingGate === 'converge' ? 'Sign off & exit' : 'Approve next iteration'} <ArrowRight size={13} />
            </Button>
          </Slab>
        )}

        {state.status === 'exhausted' && (
          <Slab title="Budget spent" bodyClassName="space-y-2">
            <p className="text-[12px] leading-relaxed text-secondary">
              {state.config.maxIterations} iteration{state.config.maxIterations > 1 ? 's' : ''} in, still {green}/{state.signals.length}. p99 is the lone holdout.
            </p>
            <Button variant="primary" className="w-full" onClick={loop.extend}>
              <Plus size={13} /> Extend +1 iteration
            </Button>
            <Button variant="quiet" className="w-full" onClick={loop.acceptPartial}>
              Accept {green}/{state.signals.length} & review gap
            </Button>
          </Slab>
        )}

        {loop.ready && (
          <Slab title="Loop closed" bodyClassName="space-y-2">
            <p className="text-[12px] leading-relaxed text-secondary">
              {state.status === 'converged'
                ? `Converged in ${state.history.length} iteration${state.history.length > 1 ? 's' : ''}. Every signal green.`
                : 'Shipped with one known gap, logged for review.'}
            </p>
            <Button variant="primary" className="w-full" onClick={onOpenReview}>
              Open review <ArrowRight size={13} />
            </Button>
          </Slab>
        )}

        <Boundary
          fallback={
            <Slab title="Verify · WebAssembly">
              <p className="text-[11.5px] leading-relaxed text-muted">Sandbox unavailable in this environment — verification falls back to the scripted signals below.</p>
            </Slab>
          }
        >
          <WasmVerify fixed={state.iteration >= 2 || loop.ready} />
        </Boundary>

        <Slab
          title="Convergence"
          right={
            <span className={cn('font-display text-[14px] font-semibold tnum', green === state.signals.length ? 'text-ok' : 'text-secondary')}>
              {green}
              <span className="text-muted">/{state.signals.length}</span>
            </span>
          }
        >
          <div className="flex gap-1">
            {state.signals.map((s) => (
              <div key={s.id} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-500', s.status === 'pass' ? 'bg-ok' : s.status === 'fail' ? 'bg-err' : 'bg-primary/[0.1]')} />
            ))}
          </div>
          <div className="mt-1.5 divide-y divide-primary/[0.07]">
            {state.signals.map((s) => (
              <SignalRow key={s.id} s={s} />
            ))}
          </div>
        </Slab>

        <Slab title="Hermes transmissions" bodyClassName="space-y-2.5">
          {state.memos.length === 0 ? (
            <p className="text-[11.5px] leading-relaxed text-muted">Hermes posts a transmission after each iteration — the finding, the directive, and where it routes.</p>
          ) : (
            [...state.memos].reverse().map((m) => <Transmission key={m.id} memo={m} />)
          )}
        </Slab>
      </div>
    </div>
  )
}
