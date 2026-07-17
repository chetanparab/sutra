import { Check, FileText, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Chip, Label, cn } from '../components/ui'
import { SPEC_DOCS, SPEC_META, TASKS } from '../scenario'
import type { SpecPhase } from '../types'

const GEN_STEPS = ['Analyzing intent against live context', 'Drafting requirements (EARS criteria)', 'Designing architecture & data flow', 'Breaking down 12 traced tasks']

function Generating() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, GEN_STEPS.length)), 600)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="mx-auto max-w-md pt-32">
      <Label>Drafting the spec</Label>
      <h2 className="mt-2 font-display text-[19px] font-semibold">Three documents from the same live context</h2>
      <div className="mt-6 space-y-3">
        {GEN_STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2.5 text-[13px]">
            {i < step ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ok/15 ring-1 ring-ok/35">
                <Check size={11} strokeWidth={3} className="text-ok" />
              </span>
            ) : i === step ? (
              <Loader2 size={15} className="spin text-accent" />
            ) : (
              <span className="h-5 w-5 rounded-full border border-primary/15" />
            )}
            <span className={i <= step ? 'text-primary' : 'text-muted'}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SpecView({ specPhase, onApprove }: { specPhase: SpecPhase; onApprove: () => void }) {
  const [active, setActive] = useState('requirements')
  if (specPhase === 'generating') return <div className="flex-1 overflow-y-auto px-6">{<Generating />}</div>

  const doc = SPEC_DOCS.find((d) => d.id === active) ?? SPEC_DOCS[0]

  return (
    <div className="flex min-h-0 flex-1 gap-4 px-6 pb-24 pt-16">
      <div className="hidden w-[260px] shrink-0 md:block">
        <div className="surface p-4">
          <div className="flex items-center gap-2">
            <span className="font-display text-[13px] font-medium">{SPEC_META.version}</span>
            {specPhase === 'approved' ? <Chip tone="ok">approved</Chip> : <Chip tone="warn">review</Chip>}
          </div>
          <div className="mt-1 font-mono text-[10.5px] text-muted">{SPEC_META.totalLines.toLocaleString()} lines · {SPEC_META.generatedIn}</div>

          <div className="mt-4 space-y-1">
            {SPEC_DOCS.map((d) => (
              <button
                key={d.id}
                onClick={() => setActive(d.id)}
                className={cn('flex w-full items-start gap-2.5 rounded-[var(--radius)] px-2.5 py-2 text-left transition-colors', active === d.id ? 'bg-primary/[0.06]' : 'hover:bg-primary/[0.03]')}
              >
                <FileText size={14} className={cn('mt-0.5 shrink-0', active === d.id ? 'text-accent' : 'text-muted')} />
                <span className="min-w-0">
                  <span className={cn('block font-mono text-[12px]', active === d.id ? 'text-primary' : 'text-secondary')}>{d.file}</span>
                  <span className="block text-[10.5px] leading-snug text-muted">{d.lines} lines · {d.summary}</span>
                </span>
              </button>
            ))}
          </div>

          {specPhase === 'draft' && (
            <div className="mt-5">
              <Button variant="primary" className="w-full" onClick={onApprove}>
                Approve spec → tasks
              </Button>
              <p className="mt-2 text-center text-[10.5px] leading-snug text-muted">Agents only start once the spec is approved.</p>
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-baseline gap-3">
            <h2 className="font-mono text-[15px] font-semibold text-primary">{doc.file}</h2>
            <span className="text-[11px] text-muted">{doc.lines} lines</span>
          </div>
          <div className="space-y-6">
            {doc.sections.map((sec) => (
              <section key={sec.heading}>
                <h3 className="font-display text-[14px] font-semibold text-primary">{sec.heading}</h3>
                {sec.paras?.map((p) => (
                  <p key={p} className="mt-1.5 text-[13px] leading-relaxed text-secondary">
                    {p}
                  </p>
                ))}
                {sec.bullets && (
                  <ul className="mt-2 space-y-1.5">
                    {sec.bullets.map((b) => (
                      <li key={b.text} className="flex items-baseline gap-2.5 text-[12.5px] leading-relaxed">
                        {b.id ? (
                          <span className="shrink-0 translate-y-[-1px] rounded border border-primary/10 bg-primary/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-secondary">{b.id}</span>
                        ) : (
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted" />
                        )}
                        <span className="text-secondary">{b.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
            {doc.id === 'tasks' && (
              <ul className="space-y-1.5">
                {TASKS.map((task) => (
                  <li key={task.id} className="flex items-baseline gap-2.5 text-[12.5px]">
                    <span className="shrink-0 rounded border border-primary/10 bg-primary/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-secondary">{task.id}</span>
                    <span className="text-secondary">{task.title}</span>
                    <span className="ml-auto hidden shrink-0 font-mono text-[10px] text-muted sm:block">{task.reqs.join(' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
