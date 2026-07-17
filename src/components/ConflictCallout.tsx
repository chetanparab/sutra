import { CircleAlert } from 'lucide-react'
import type { ConflictDef } from '../sim/types'
import { Chip, cn } from './ui'

export default function ConflictCallout({ conflict, onResolve }: { conflict: ConflictDef; onResolve: (optionId: string) => void }) {
  return (
    <div className="anim-in rounded-[var(--radius)] border border-warn/30 bg-warn/[0.06] p-3.5">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-warn">
        <CircleAlert size={14} />
        Your call — {conflict.title.toLowerCase()}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-secondary">{conflict.body}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {conflict.options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onResolve(opt.id)}
            className={cn('rounded-[var(--radius)] border p-3 text-left transition-all', opt.recommended ? 'border-accent/45 bg-accent/[0.09] hover:bg-accent/15' : 'border-primary/12 hover:border-primary/25')}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12.5px] font-medium leading-snug text-primary">{opt.label}</span>
              {opt.recommended && <Chip tone="accent">pick</Chip>}
            </div>
            <div className="mt-1 font-mono text-[10.5px] text-muted">{opt.detail}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
