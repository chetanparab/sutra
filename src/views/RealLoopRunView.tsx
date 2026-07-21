/**
 * The run view for a REAL run (dogfooding fix): unlike the scripted demo's
 * LoopRunView — which hardcodes the payment-retry idempotency mission, a
 * scripted code surface and a WASM verifier — this shows the *actual* run: your
 * intent, the live engine output, your real verify command's result, the real
 * Hermes memos and the real diff. It reuses the shared orbit/timeline; nothing
 * on screen is canned.
 */
import { ArrowRight, Check, Feather, FolderGit2, Loader2, Radio, Terminal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import LoopOrbit from '../components/LoopOrbit'
import LoopTimeline from '../components/LoopTimeline'
import { Button, Chip, Label, Slab, cn } from '../components/ui'
import type { RealLoopController } from '../loop/useRealLoop'

function basename(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() || p
}

export default function RealLoopRunView({ real, onOpenReview }: { real: RealLoopController; onOpenReview: () => void }) {
  const { loop, meta } = real
  const { state, phaseFraction, actionLine } = loop
  const running = state.status === 'running'
  const verify = state.signals[0]
  const finalVerify = meta.outcome?.finalVerify
  const [centerView, setCenterView] = useState<'log' | 'orbit'>('log')

  // Keep the live log scrolled to the newest line.
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [meta.logs.length])

  return (
    <div className="flex min-h-0 flex-1 gap-4 px-6 pb-24 pt-16">
      {/* LEFT — the real mission */}
      <div className="hidden w-[300px] shrink-0 flex-col gap-3 overflow-y-auto xl:flex">
        <div className="anim-in">
          <Label>Your intent</Label>
          <h1 className="serif-hero balance mt-2 font-display text-[18px] font-semibold leading-[1.16] tracking-[-0.02em]">{meta.intent || '—'}</h1>
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-muted">
            <FolderGit2 size={12} className="text-accent" /> {basename(meta.workspacePath)}
          </p>
        </div>

        <Slab title="This run" bodyClassName="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="label">Verify</span>
            <span className="font-mono text-[11px] text-secondary">{meta.verifyCmd}</span>
          </div>
          <div className="flex items-center justify-between border-t border-primary/10 pt-2.5">
            <span className="label">Where</span>
            <Chip tone={meta.verifyMode === 'container' ? 'accent' : 'neutral'}>{meta.verifyMode === 'container' ? 'isolated container' : 'local'}</Chip>
          </div>
          <div className="flex items-center justify-between border-t border-primary/10 pt-2.5">
            <span className="label">Budget</span>
            <span className="font-display text-[13px] font-medium tnum">{state.config.maxIterations} iters</span>
          </div>
        </Slab>

        <Slab title="Iterations" bodyClassName="space-y-1.5">
          {state.history.length === 0 && running ? (
            <p className="text-[11.5px] text-muted">First pass in flight — the result lands after Verify runs.</p>
          ) : (
            <>
              {state.history.map((h) => (
                <div key={h.n} className="surface-2 flex items-center gap-2.5 px-2.5 py-2">
                  <span className="font-mono text-[11px] text-muted">#{h.n}</span>
                  <span className={cn('font-display text-[13px] font-medium', h.converged ? 'text-ok' : 'text-warn')}>{h.converged ? 'verify passed' : 'verify failed'}</span>
                </div>
              ))}
              {running && (
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

      {/* CENTER — live engine output / orbit */}
      <div className="relative flex min-w-0 flex-1 flex-col items-center gap-3 overflow-hidden py-1">
        <div className="flex shrink-0 items-center rounded-full border border-primary/12 bg-primary/[0.03] p-0.5">
          {(['log', 'orbit'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setCenterView(v)}
              className={cn('rounded-full px-4 py-1 text-[12px] font-medium transition-colors', centerView === v ? 'bg-primary/10 text-primary' : 'text-muted hover:text-secondary')}
            >
              {v === 'log' ? 'Engine' : 'Orbit'}
            </button>
          ))}
        </div>

        {centerView === 'log' ? (
          <div className="surface flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-primary/10 px-3.5 py-2">
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                <Terminal size={12} className="text-accent" /> engine output
              </span>
              {running ? (
                <span className="flex items-center gap-1.5 text-[10.5px] font-medium capitalize text-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent soft-pulse" /> {state.phase} · live
                </span>
              ) : (
                <span className="text-[10.5px] text-muted">done</span>
              )}
            </div>
            <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 font-mono text-[11px] leading-[1.6] text-secondary">
              {meta.logs.length === 0 ? (
                <div className="flex h-full items-center justify-center gap-2 text-muted">
                  <Loader2 size={12} className="spin" /> waiting for the engine…
                </div>
              ) : (
                meta.logs.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-words">
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <LoopOrbit
            phase={state.phase}
            fraction={phaseFraction}
            iteration={state.iteration}
            maxIterations={state.config.maxIterations}
            status={state.status}
            gates={state.config.gates}
            paused={false}
            green={verify?.status === 'pass' ? 1 : 0}
            total={1}
            memoCount={state.memos.length}
          />
        )}

        <div className="anim-in surface-2 flex w-full max-w-2xl shrink-0 items-center gap-3 border border-primary/8 px-4 py-2.5">
          {running ? <Radio size={14} className="shrink-0 text-accent soft-pulse" /> : loop.ready ? <Check size={14} className="shrink-0 text-ok" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-warn soft-pulse" />}
          <span className="min-w-0 flex-1 truncate text-[12px] text-secondary">{actionLine}</span>
        </div>

        {state.events.length > 0 && (
          <div className="anim-in flex w-full shrink-0 justify-center">
            <LoopTimeline events={state.events} running={running} />
          </div>
        )}
      </div>

      {/* RIGHT — real verify + convergence + memos */}
      <div className="flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto">
        {loop.ready && (
          <Slab title={state.status === 'converged' ? 'Loop converged' : 'Loop stopped'} bodyClassName="space-y-2">
            <p className="text-[12px] leading-relaxed text-secondary">
              {state.status === 'converged'
                ? `Converged in ${state.history.length} iteration${state.history.length > 1 ? 's' : ''} — your verify command passed.`
                : (state.events.at(-1)?.label ?? 'The loop stopped before converging.')}
              {meta.outcome && <> · ~${(meta.outcome.totalCostUsd ?? 0).toFixed(3)} spent.</>}
            </p>
            <Button variant="primary" className="w-full" onClick={onOpenReview}>
              Review the real diff <ArrowRight size={13} />
            </Button>
          </Slab>
        )}

        <Slab
          title={`Verify · ${meta.verifyMode === 'container' ? 'container' : 'local'}`}
          right={
            verify?.status === 'pass' ? (
              <span className="flex items-center gap-1 text-[11.5px] text-ok">
                <Check size={12} /> passed
              </span>
            ) : verify?.status === 'fail' ? (
              <span className="flex items-center gap-1 text-[11.5px] text-err">
                <X size={12} /> failed
              </span>
            ) : (
              <span className="text-[11.5px] text-muted">pending</span>
            )
          }
        >
          <p className="font-mono text-[11px] text-secondary">{meta.verifyCmd}</p>
          {finalVerify && (finalVerify.stdout || finalVerify.stderr) && (
            <pre className="mt-2.5 max-h-40 overflow-auto rounded-[var(--radius)] border border-primary/10 bg-primary/[0.03] p-2.5 font-mono text-[10.5px] leading-[1.5] text-muted">
              {(finalVerify.stdout + '\n' + finalVerify.stderr).trim().slice(-1500)}
            </pre>
          )}
        </Slab>

        <Slab title="Hermes memos" bodyClassName="space-y-2.5">
          {state.memos.length === 0 ? (
            <p className="text-[11.5px] leading-relaxed text-muted">After a failed Verify, the model writes a memo — the finding and the directive for the next Build. It appears here.</p>
          ) : (
            [...state.memos].reverse().map((m) => (
              <div key={m.id} className="anim-rise surface-2 rounded-[var(--radius)] border border-primary/8 p-3">
                <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-muted">
                  <Feather size={12} className="text-accent" /> HERMES · ITER {m.iteration}
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-secondary">{m.finding}</p>
                <div className="mt-2 flex items-start gap-1.5 rounded-[var(--radius)] bg-primary/[0.05] px-2.5 py-1.5">
                  <ArrowRight size={12} className="mt-0.5 shrink-0 text-accent" />
                  <span className="text-[11.5px] leading-snug text-primary">{m.directive}</span>
                </div>
              </div>
            ))
          )}
        </Slab>
      </div>
    </div>
  )
}
