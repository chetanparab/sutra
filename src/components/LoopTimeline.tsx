import { CircleCheck, Feather, FlaskConical, Hash, TriangleAlert, UserCheck } from 'lucide-react'
import { Fragment } from 'react'
import { fmtElapsed } from '../loop/useLoop'
import type { EventTone, LoopEvent, LoopEventKind } from '../loop/types'
import { Label, cn } from './ui'

const ICON: Record<LoopEventKind, React.ReactNode> = {
  iteration: <Hash size={11} />,
  phase: <Hash size={11} />,
  conflict: <TriangleAlert size={11} />,
  decision: <UserCheck size={11} />,
  verify: <FlaskConical size={11} />,
  memo: <Feather size={11} />,
  converge: <CircleCheck size={11} />,
  exhausted: <TriangleAlert size={11} />,
}

const TONE: Record<EventTone, string> = {
  accent: 'text-accent bg-accent/12 ring-accent/30',
  ok: 'text-ok bg-ok/12 ring-ok/30',
  warn: 'text-warn bg-warn/12 ring-warn/30',
  muted: 'text-muted bg-primary/[0.05] ring-primary/15',
}

export default function LoopTimeline({ events, running }: { events: LoopEvent[]; running: boolean }) {
  return (
    <div className="w-full max-w-2xl">
      <div className="mb-2 flex items-center gap-2">
        <Label>Flight recorder</Label>
        <span className="text-[10.5px] text-muted">{events.length} events · replayable</span>
      </div>
      <div className="surface-2 flex items-center gap-0 overflow-x-auto border border-primary/8 px-3 py-2.5">
        {events.map((e, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="h-px w-4 shrink-0 bg-primary/12" />}
            <div className="group/ev flex shrink-0 flex-col items-center" title={`${e.label} · T+${fmtElapsed(e.t)}`}>
              <span className={cn('flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-inset', TONE[e.tone])}>{ICON[e.kind]}</span>
              <span className="mt-1 font-mono text-[9px] tnum text-muted">{fmtElapsed(e.t)}</span>
            </div>
          </Fragment>
        ))}
        {running && (
          <>
            <span className="h-px w-4 shrink-0 bg-primary/12" />
            <div className="flex shrink-0 flex-col items-center">
              <span className="flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-inset ring-accent/40">
                <span className="h-2 w-2 rounded-full bg-accent soft-pulse" />
              </span>
              <span className="mt-1 font-mono text-[9px] text-muted">now</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
