import { ArrowRight, Check, Layers, Lock, RotateCcw } from 'lucide-react'
import type { StageId, StageItem } from '../types'
import { cn } from './ui'

function Node({ state }: { state: StageItem['state']; current?: boolean }) {
  if (state === 'done')
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ok/15 ring-1 ring-ok/40">
        <Check size={11} strokeWidth={3} className="text-ok" />
      </span>
    )
  if (state === 'locked')
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/[0.04] ring-1 ring-primary/10">
        <Lock size={10} className="text-faint" />
      </span>
    )
  const warn = state === 'attention'
  return (
    <span className={cn('flex h-6 w-6 items-center justify-center rounded-full ring-1', warn ? 'bg-warn/15 ring-warn/50' : 'bg-accent/15 ring-accent/50')}>
      <span className={cn('h-2 w-2 rounded-full soft-pulse', warn ? 'bg-warn' : 'bg-accent')} />
    </span>
  )
}

export default function ConsoleDock({
  stages,
  current,
  onNavigate,
  activeIndex,
  onToggleContext,
  onReplay,
  cta,
}: {
  stages: StageItem[]
  current: StageId
  onNavigate: (s: StageId) => void
  activeIndex: number
  /** The scenario context-sources drawer — web-demo only; omit to hide it. */
  onToggleContext?: () => void
  onReplay?: () => void
  cta?: { label: string; onClick: () => void } | null
}) {
  const hasTail = onReplay || onToggleContext || cta
  return (
    <div className="absolute bottom-5 left-1/2 z-30 -translate-x-1/2">
      <div className="surface flex items-center gap-1 rounded-full px-2 py-2">
        <div className="flex items-center px-1">
          {stages.map((s, i) => {
            const clickable = s.state !== 'locked'
            const isCurrent = current === s.id
            return (
              <div key={s.id} className="flex items-center">
                {i > 0 && <span className={cn('mx-1 h-px w-6 transition-colors', i <= activeIndex ? 'bg-accent/50' : 'bg-primary/12')} />}
                <button
                  onClick={() => clickable && onNavigate(s.id)}
                  disabled={!clickable}
                  className={cn('flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 transition-colors', isCurrent ? 'bg-primary/[0.06]' : clickable ? 'hover:bg-primary/[0.03]' : 'cursor-not-allowed')}
                >
                  <Node state={s.state} current={isCurrent} />
                  <span className="min-w-0 text-left">
                    <span className={cn('block font-display text-[12.5px] leading-tight', isCurrent ? 'font-semibold text-primary' : clickable ? 'text-secondary' : 'text-faint')}>{s.label}</span>
                    {s.hint && isCurrent && <span className={cn('block text-[9.5px] leading-tight', s.state === 'attention' ? 'text-warn' : 'text-muted')}>{s.hint}</span>}
                  </span>
                </button>
              </div>
            )
          })}
        </div>

        {hasTail && <span className="mx-1 h-7 w-px bg-primary/12" />}

        <div className="flex items-center gap-1 pr-1">
          {onReplay && (
            <button onClick={onReplay} title="Restart this run" className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-primary/[0.06] hover:text-primary">
              <RotateCcw size={14} />
            </button>
          )}
          {onToggleContext && (
            <button onClick={onToggleContext} title="Context sources" className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] text-muted transition-colors hover:bg-primary/[0.06] hover:text-secondary">
              <Layers size={13} />
              <span className="flex items-center gap-1 text-ok">
                <span className="h-1.5 w-1.5 rounded-full bg-ok soft-pulse" />5
              </span>
            </button>
          )}
          {cta && (
            <button onClick={cta.onClick} className="ml-0.5 flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[12px] font-medium text-accentink transition-all hover:brightness-[1.06]">
              {cta.label}
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
