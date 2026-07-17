import { ArrowRight, Check, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import BlastMap from '../components/BlastMap'
import { Button, Chip, Slab, cn } from '../components/ui'
import { DIFF_TOTALS, FILE_NOTES, INTENT_ID, INTENT_SUMMARY_BULLETS, METRICS, RAW_DIFF, RISKS, SIGNALS } from '../scenario'
import type { Mode } from '../types'

function Detail() {
  const [tab, setTab] = useState<'files' | 'diff'>('files')
  return (
    <Slab
      title="Detail — escalate only as far as you need"
      right={
        <div className="flex gap-1">
          {(
            [
              { id: 'files' as const, label: 'Per-file intent' },
              { id: 'diff' as const, label: 'Raw diff' },
            ] as const
          ).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn('rounded-full px-3 py-1 text-[11px] font-medium transition-colors', tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted hover:text-secondary')}>
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'files' ? (
        <div className="anim-in divide-y divide-primary/[0.07]">
          {FILE_NOTES.map((f) => (
            <div key={f.path} className="py-2.5 first:pt-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-[11.5px] text-primary">{f.path}</span>
                {f.isNew && <Chip tone="accent">new</Chip>}
                <span className="ml-auto shrink-0 font-mono text-[11px] tnum">
                  <span className="text-ok">+{f.added}</span> <span className="text-err">−{f.removed}</span>
                </span>
              </div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-muted">{f.note}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="anim-in">
          <div className="mb-2 flex items-center gap-2 text-[11px] text-muted">
            <span className="font-mono text-secondary">{RAW_DIFF.file}</span>
            <span>· 1 of 8</span>
            <Chip tone="warn" className="ml-auto">
              last resort
            </Chip>
          </div>
          <pre className="surface-2 overflow-x-auto border border-primary/8 p-3 font-mono text-[11px] leading-relaxed">
            {RAW_DIFF.hunk.map((line, i) => (
              <div
                key={i}
                className={cn(
                  line.startsWith('+') && 'text-ok',
                  line.startsWith('-') && 'text-err',
                  line.startsWith('@@') && 'text-info',
                  !line.startsWith('+') && !line.startsWith('-') && !line.startsWith('@@') && 'text-secondary',
                )}
              >
                {line}
              </div>
            ))}
          </pre>
        </div>
      )}
    </Slab>
  )
}

export default function ReviewView({
  mode,
  approved,
  onApprove,
  iterations,
  accepted,
}: {
  mode: Mode
  approved: boolean
  onApprove: () => void
  iterations?: number | null
  accepted?: boolean
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 pb-28 pt-16">
        <div className="anim-rise mb-5 flex flex-wrap items-center gap-3">
          <Chip tone="accent">{INTENT_ID}</Chip>
          <h1 className="serif-hero font-display text-[23px] font-semibold tracking-[-0.02em]">Idempotency keys for the payment retry flow</h1>
          <span className="ml-auto font-mono text-[11px] text-muted">
            {mode === 'specless' && iterations ? `converged in ${iterations} iteration${iterations > 1 ? 's' : ''} · ` : ''}
            {DIFF_TOTALS}
          </span>
          {approved ? <Chip tone="ok">approved</Chip> : accepted ? <Chip tone="warn">1 known gap</Chip> : <Chip tone="info">awaiting approval</Chip>}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Slab title="What changed & why">
              <ul className="space-y-2.5">
                {INTENT_SUMMARY_BULLETS.map((b) => (
                  <li key={b} className="flex gap-2.5 text-[13px] leading-relaxed text-primary">
                    <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-accent" />
                    {b}
                  </li>
                ))}
              </ul>
            </Slab>

            <Slab title="Verification" right={<Chip tone="ok">{SIGNALS.length}/{SIGNALS.length} green</Chip>} bodyClassName="divide-y divide-primary/[0.07]">
              {SIGNALS.map((s) => (
                <div key={s.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-ok/16 ring-1 ring-ok/35">
                    <Check size={10} strokeWidth={3} className="text-ok" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12.5px] text-primary">{s.name}</span>
                      {mode === 'spec' && <span className="rounded bg-primary/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] text-secondary">{s.req}</span>}
                    </div>
                    <div className="truncate font-mono text-[10px] text-muted">{s.test}</div>
                  </div>
                  <span className="shrink-0 text-right text-[11px] text-secondary">{s.result}</span>
                </div>
              ))}
            </Slab>

            <Detail />
          </div>

          <div className="space-y-4">
            <Slab title="Risk" bodyClassName="space-y-1.5">
              {RISKS.map((r) => (
                <div key={r.label} className="flex items-center gap-2.5 text-[12.5px]">
                  {r.tone === 'warn' ? <TriangleAlert size={13} className="shrink-0 text-warn" /> : <Check size={13} className="shrink-0 text-ok" />}
                  <span className={r.tone === 'warn' ? 'text-primary' : 'text-secondary'}>{r.label}</span>
                </div>
              ))}
            </Slab>

            <Slab title="Blast radius">
              <BlastMap />
            </Slab>

            {mode === 'specless' ? (
              <Slab title="Review effort">
                <div className="rounded-[var(--radius)] border border-accent/25 bg-accent/[0.07] px-3 py-2.5">
                  <div className="label">Specless review</div>
                  <div className="mt-0.5 font-display text-[20px] font-semibold text-accent">{METRICS.specless.effort}</div>
                  <div className="text-[11px] text-muted">{METRICS.specless.detail}</div>
                </div>
                <div className="surface-2 mt-2 border border-primary/8 px-3 py-2.5 opacity-90">
                  <div className="label">Spec-driven equivalent</div>
                  <div className="mt-0.5 font-display text-[20px] font-semibold text-secondary">{METRICS.sdd.effort}</div>
                  <div className="text-[11px] text-muted">{METRICS.sdd.detail}</div>
                </div>
                <div className="mt-2.5 text-center font-display text-[12px] font-medium text-ok">{METRICS.delta}</div>
              </Slab>
            ) : (
              <Slab title="Traceability">
                <p className="text-[12px] leading-relaxed text-secondary">
                  Every signal traces to a requirement; every task carried its ids into the diff. Coverage: <span className="font-mono text-primary">7/7 FRs</span> · <span className="font-mono text-primary">12/12 tasks</span>.
                </p>
              </Slab>
            )}

            <Slab title="Decision" bodyClassName="space-y-2">
              <Button variant="primary" className="w-full" onClick={onApprove} disabled={approved}>
                {approved ? 'Approved' : 'Approve'} {!approved && <ArrowRight size={13} />}
              </Button>
              <Button variant="quiet" className="w-full">
                Request changes
              </Button>
              <Button variant="danger" className="w-full">
                Take over manually
              </Button>
            </Slab>
          </div>
        </div>
      </div>
    </div>
  )
}
