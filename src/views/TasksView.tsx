import { Check, Circle, CircleAlert, Loader2, Play } from 'lucide-react'
import ConflictCallout from '../components/ConflictCallout'
import { Button, Label, ProgressThin, cn } from '../components/ui'
import { TASKS, type TaskDef } from '../scenario'
import type { AgentRt } from '../sim/types'
import type { Sim } from '../sim/useSimulation'

type TaskStatus = 'queued' | 'running' | 'blocked' | 'done'

function agentName(sim: Sim, id: string): string {
  return sim.state.agents.find((a) => a.def.id === id)?.def.name ?? id
}

function taskStatuses(sim: Sim): Map<string, TaskStatus> {
  const result = new Map<string, TaskStatus>()
  const doneFor = (task: TaskDef, agent: AgentRt) => agent.status === 'done' || agent.status === 'needs-review' || agent.stepIdx > task.doneAtStep
  for (const agent of sim.state.agents) {
    const mine = TASKS.filter((t) => t.agent === agent.def.id)
    let flagged = false
    for (const task of mine) {
      if (doneFor(task, agent)) result.set(task.id, 'done')
      else if (agent.status === 'blocked' && !flagged) {
        result.set(task.id, 'blocked')
        flagged = true
      } else if (agent.status === 'running' && !flagged) {
        result.set(task.id, 'running')
        flagged = true
      } else result.set(task.id, 'queued')
    }
  }
  return result
}

const ICON: Record<TaskStatus, () => React.ReactNode> = {
  queued: () => <Circle size={14} className="text-primary/20" />,
  running: () => <Loader2 size={14} className="spin text-accent" />,
  blocked: () => <CircleAlert size={14} className="text-warn" />,
  done: () => (
    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ok/16 ring-1 ring-ok/35">
      <Check size={10} strokeWidth={3} className="text-ok" />
    </span>
  ),
}

export default function TasksView({ sim, onStart }: { sim: Sim; onStart: () => void }) {
  const statuses = taskStatuses(sim)
  const done = [...statuses.values()].filter((s) => s === 'done').length
  const blockedAgent = sim.state.agents.find((a) => a.status === 'blocked')
  const executing = sim.state.started

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-6 pb-28 pt-16">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <Label>Tasks</Label>
            <p className="mt-1.5 text-[12.5px] text-secondary">
              {!executing
                ? '12 tasks traced to requirements. Agents execute in dependency order.'
                : blockedAgent
                  ? 'Execution paused — a task needs your decision below.'
                  : sim.phase === 'ready'
                    ? 'All tasks complete. The change is ready for review.'
                    : `Executing · ${done}/12 done`}
            </p>
          </div>
          {!executing ? (
            <Button variant="primary" onClick={onStart}>
              <Play size={13} /> Start execution
            </Button>
          ) : (
            <div className="w-40">
              <ProgressThin value={done / TASKS.length} />
              <div className="mt-1 text-right font-mono text-[10.5px] tnum text-muted">{done}/12</div>
            </div>
          )}
        </div>

        <div className="surface overflow-hidden">
          {TASKS.map((task, i) => {
            const status = statuses.get(task.id) ?? 'queued'
            const isConflict = status === 'blocked' && blockedAgent && task.agent === blockedAgent.def.id
            return (
              <div key={task.id} className={cn(i > 0 && 'border-t border-primary/[0.07]')}>
                <div className={cn('flex items-center gap-3 px-4 py-2.5', status === 'done' && 'opacity-70', isConflict && 'bg-warn/[0.06]')}>
                  {ICON[status]()}
                  <span className="w-11 shrink-0 font-mono text-[11px] text-muted">{task.id}</span>
                  <span className={cn('min-w-0 flex-1 truncate text-[13px]', status === 'queued' ? 'text-secondary' : 'text-primary')}>{task.title}</span>
                  <span className="hidden shrink-0 gap-1 font-mono text-[10px] text-muted md:flex">
                    {task.reqs.map((r) => (
                      <span key={r} className="rounded bg-primary/[0.06] px-1.5 py-0.5">{r}</span>
                    ))}
                  </span>
                  <span className="w-20 shrink-0 text-right text-[11px] text-muted">{agentName(sim, task.agent)}</span>
                </div>
                {isConflict && blockedAgent.conflict && (
                  <div className="px-4 pb-3.5">
                    <ConflictCallout conflict={blockedAgent.conflict} onResolve={(opt) => sim.resolveConflict(blockedAgent.def.id, opt)} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
