/**
 * Spec-mode-real review (ROADMAP.md Phase 5+): the model just drafted a spec
 * for THIS intent in THIS repo — requirements, an approach, a task list. This
 * is the human's turn: read it, edit it, then build it. "Build this plan" folds
 * the (possibly edited) spec into one instruction the real loop executes — Spec
 * reuses the loop, it doesn't fork it. Nothing is scripted; every line here came
 * from the engine's `plan` call.
 */
import { ArrowRight, ListChecks, Plus, RotateCcw, Sparkles, Target, X } from 'lucide-react'
import { useState } from 'react'
import { Button, Label, Slab, cn } from '../components/ui'
import type { PlannedSpec } from '../desktop/realLoop'

const INPUT =
  'w-full rounded-[var(--radius)] border border-primary/[0.14] bg-primary/[0.02] px-3 py-2 text-[12.5px] text-primary outline-none transition-all placeholder:text-faint hover:border-primary/25 focus:border-accent/55 focus:ring-2 focus:ring-accent/15'

export default function RealSpecView({
  intent,
  draft,
  building,
  onBuild,
  onDiscard,
}: {
  intent: string
  draft: PlannedSpec
  building: boolean
  onBuild: (edited: PlannedSpec) => void
  onDiscard: () => void
}) {
  const [requirements, setRequirements] = useState<string[]>(draft.requirements.length ? draft.requirements : [''])
  const [approach, setApproach] = useState(draft.approach)
  const [tasks, setTasks] = useState(draft.tasks.length ? draft.tasks : [{ title: '', detail: '' }])

  const setReq = (i: number, v: string) => setRequirements((r) => r.map((x, j) => (j === i ? v : x)))
  const setTask = (i: number, k: 'title' | 'detail', v: string) => setTasks((t) => t.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  const clean: PlannedSpec = {
    requirements: requirements.map((r) => r.trim()).filter(Boolean),
    approach: approach.trim(),
    tasks: tasks.map((t) => ({ title: t.title.trim(), detail: t.detail.trim() })).filter((t) => t.title),
  }
  const canBuild = clean.requirements.length > 0 || clean.tasks.length > 0

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 pb-28 pt-20">
        <div className="anim-rise mb-6">
          <Label>Review the plan</Label>
          <h1 className="serif-hero balance mt-3.5 font-display text-[clamp(24px,3.2vw,32px)] font-semibold leading-[1.06] tracking-[-0.03em]">
            Sutra drafted a plan — <span className="italic font-medium text-accent">yours to change</span>
          </h1>
          <p className="pretty mt-2.5 max-w-[58ch] text-[13px] leading-[1.6] text-secondary">
            Real requirements, approach and tasks the model wrote for “{intent}”. Edit anything, then build — the loop
            implements the plan and verifies it, exactly like a direct run.
          </p>
        </div>

        {/* Approach */}
        <Slab
          className="anim-rise"
          title={
            <span className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-muted" /> <Label tick={false}>Approach</Label>
            </span>
          }
        >
          <textarea value={approach} onChange={(e) => setApproach(e.target.value)} rows={3} placeholder="How the change will be implemented…" className={cn(INPUT, 'resize-none leading-relaxed')} />
        </Slab>

        {/* Requirements */}
        <Slab
          className="anim-rise mt-4"
          title={
            <span className="flex items-center gap-1.5">
              <Target size={12} className="text-muted" /> <Label tick={false}>Requirements</Label>
            </span>
          }
          right={<span className="text-[10.5px] text-faint">what must be true when done</span>}
          bodyClassName="space-y-2"
        >
          {requirements.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[11px] text-faint">{i + 1}</span>
              <input value={r} onChange={(e) => setReq(i, e.target.value)} placeholder="A checkable statement…" className={cn(INPUT, 'flex-1')} />
              <button onClick={() => setRequirements((rs) => rs.filter((_, j) => j !== i))} className="shrink-0 text-muted transition-colors hover:text-warn" title="Remove">
                <X size={14} />
              </button>
            </div>
          ))}
          <button onClick={() => setRequirements((r) => [...r, ''])} className="flex items-center gap-1.5 text-[11.5px] text-muted transition-colors hover:text-accent">
            <Plus size={13} /> Add a requirement
          </button>
        </Slab>

        {/* Tasks */}
        <Slab
          className="anim-rise mt-4"
          title={
            <span className="flex items-center gap-1.5">
              <ListChecks size={12} className="text-muted" /> <Label tick={false}>Tasks</Label>
            </span>
          }
          bodyClassName="space-y-2.5"
        >
          {tasks.map((t, i) => (
            <div key={i} className="flex items-start gap-2 rounded-[var(--radius)] border border-primary/[0.08] p-2.5">
              <span className="mt-2 font-mono text-[10.5px] text-faint">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <input value={t.title} onChange={(e) => setTask(i, 'title', e.target.value)} placeholder="Task title…" className={cn(INPUT, 'font-medium')} />
                <input value={t.detail} onChange={(e) => setTask(i, 'detail', e.target.value)} placeholder="One line of detail…" className={cn(INPUT, 'text-[11.5px]')} />
              </div>
              <button onClick={() => setTasks((ts) => ts.filter((_, j) => j !== i))} className="mt-1 shrink-0 text-muted transition-colors hover:text-warn" title="Remove">
                <X size={14} />
              </button>
            </div>
          ))}
          <button onClick={() => setTasks((t) => [...t, { title: '', detail: '' }])} className="flex items-center gap-1.5 text-[11.5px] text-muted transition-colors hover:text-accent">
            <Plus size={13} /> Add a task
          </button>
        </Slab>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onDiscard} disabled={building}>
            <RotateCcw size={13} /> Discard &amp; re-plan
          </Button>
          <Button variant="primary" size="lg" disabled={!canBuild || building} onClick={() => onBuild(clean)}>
            {building ? 'Building…' : 'Build this plan'} <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  )
}
