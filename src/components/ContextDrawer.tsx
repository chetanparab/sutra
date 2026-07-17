import { AlertTriangle, BookOpenCheck, CalendarClock, Radio, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CONTEXT_CHIPS, type ContextChipData } from '../scenario'
import { Label, cn } from './ui'

const ICONS: Record<string, typeof Users> = {
  conventions: BookOpenCheck,
  ownership: Users,
  telemetry: Radio,
  calendar: CalendarClock,
  incidents: AlertTriangle,
}

function LiveTelemetry() {
  const [tps, setTps] = useState(40.2)
  const [p99, setP99] = useState(412)
  useEffect(() => {
    const id = setInterval(() => {
      setTps((v) => Math.round((v + (Math.random() - 0.5) * 0.3) * 10) / 10)
      setP99((v) => Math.max(380, Math.min(440, v + Math.round((Math.random() - 0.5) * 8))))
    }, 2000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="space-y-0.5 text-[11.5px] text-secondary">
      <div>payment-retry p99 <span className="font-mono text-primary">{p99}ms</span> · err <span className="font-mono text-primary">0.02%</span></div>
      <div>peak <span className="font-mono text-primary">{tps.toFixed(1)}K TPS</span> · redis <span className="font-mono text-primary">61%</span></div>
    </div>
  )
}

function Item({ chip }: { chip: ContextChipData }) {
  const [open, setOpen] = useState(false)
  const Icon = ICONS[chip.id] ?? BookOpenCheck
  return (
    <button onClick={() => setOpen((v) => !v)} className="surface-2 w-full border border-primary/8 p-3 text-left transition-colors hover:border-primary/16">
      <div className="flex items-start gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/[0.05]">
          <Icon size={13} className="text-secondary" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-medium">{chip.title}</span>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted">
              {chip.live && <span className="h-1.5 w-1.5 rounded-full bg-ok soft-pulse" />}
              {chip.freshness}
            </span>
          </div>
          <div className="mt-1">
            {chip.id === 'telemetry' ? (
              <LiveTelemetry />
            ) : (
              chip.lines.map((l) => (
                <div key={l} className="truncate text-[11.5px] leading-relaxed text-secondary">
                  {l}
                </div>
              ))
            )}
          </div>
          {open && (
            <div className="anim-in mt-2 space-y-1 border-t border-primary/10 pt-2">
              {chip.detail.map((l) => (
                <div key={l} className="text-[11px] leading-relaxed text-muted">
                  {l}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

export default function ContextDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} className={cn('fixed inset-0 z-40 bg-black/30 transition-opacity', open ? 'opacity-100' : 'pointer-events-none opacity-0')} />
      <aside
        style={{ transform: open ? 'translateX(0)' : 'translateX(calc(100% + 1.5rem))' }}
        className="surface fixed right-4 top-4 z-50 flex h-[calc(100%-2rem)] w-[340px] flex-col transition-transform duration-300"
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <div>
            <Label>Context Plane</Label>
            <p className="mt-1.5 text-[11.5px] leading-snug text-muted">What agents read instead of a frozen document.</p>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-primary/[0.06] hover:text-primary">
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
          {CONTEXT_CHIPS.map((c) => (
            <Item key={c.id} chip={c} />
          ))}
        </div>
      </aside>
    </>
  )
}
