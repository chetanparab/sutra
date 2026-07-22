import { Activity, CalendarClock, Command, Cpu, Home } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchEngineVersion, isDesktop, type EngineInfo } from '../desktop/engine'
import { isLocalEngine } from '../desktop/localEngine'
import { APP_NAME } from '../scenario'
import type { Mode } from '../types'
import ThemeSwitcher, { type ThemeId } from './ThemeSwitcher'
import { cn } from './ui'

/** Renders only inside the desktop shell, where the sidecar handshake succeeds. */
function EngineChip() {
  const [info, setInfo] = useState<EngineInfo | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchEngineVersion().then((v) => {
      if (!cancelled) setInfo(v)
    })
    return () => {
      cancelled = true
    }
  }, [])
  if (!info) return null
  return (
    <span className="hidden items-center gap-1.5 lg:flex" title={`engine ${info.engine} · node ${info.node}`}>
      <Cpu size={12} className="text-accent" /> engine <span className="font-mono tnum text-secondary">{info.engine}</span>
    </span>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="font-mono tnum text-secondary">
      {new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(now)}
      <span className="text-faint"> IST</span>
    </span>
  )
}

export default function TopChrome({
  mode,
  onModeChange,
  runTime,
  theme,
  onThemeChange,
  onOpenCommand,
}: {
  mode: Mode
  onModeChange: (m: Mode) => void
  runTime: string | null
  theme: ThemeId
  onThemeChange: (t: ThemeId) => void
  onOpenCommand: () => void
}) {
  const [p99, setP99] = useState(412)
  useEffect(() => {
    const id = setInterval(() => setP99((v) => Math.max(380, Math.min(440, v + Math.round((Math.random() - 0.5) * 8)))), 2400)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      <div className="absolute left-6 top-5 z-30 flex items-center gap-3.5">
        <a
          href={`/?theme=${theme}`}
          title="Back to the Sutra site"
          className="group flex items-center gap-2.5 rounded-[var(--radius)] transition-opacity hover:opacity-90"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] bg-accent text-accentink">
            <span className="h-3 w-3 rounded-full bg-current opacity-90 breathe" />
          </span>
          <div className="leading-none">
            <div className="flex items-center gap-1.5 font-display text-[16px] font-semibold tracking-[0.02em]">
              {APP_NAME}
              <Home size={11} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div className="label mt-1" style={{ letterSpacing: '0.2em' }}>
              Loop Engine
            </div>
          </div>
        </a>

        {/* Two real workflows: Loop (go straight) and Spec (plan → review →
            build). Both real on desktop; both drive the web preview too. */}
        <div className="ml-1 flex rounded-full border border-primary/12 bg-primary/[0.03] p-0.5">
          {(
            [
              { v: 'specless' as Mode, label: 'Loop' },
              { v: 'spec' as Mode, label: 'Spec' },
            ] as const
          ).map((m) => (
            <button
              key={m.v}
              onClick={() => onModeChange(m.v)}
              className={cn('rounded-full px-3.5 py-1 text-[12px] font-medium transition-all', mode === m.v ? 'bg-primary/10 text-primary' : 'text-muted hover:text-secondary')}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="absolute right-6 top-5 z-30 flex items-center gap-4 text-[11.5px] text-muted">
        {isDesktop() || isLocalEngine() ? (
          <span className="flex items-center gap-1.5 text-ok" title={isDesktop() ? 'Desktop app — real' : 'Connected to a local engine — real'}>
            <span className="h-1.5 w-1.5 rounded-full bg-ok soft-pulse" /> live
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-warn" title="This browser page is a demo — connect a local engine or download the desktop app to run for real">
            <span className="h-1.5 w-1.5 rounded-full bg-warn" /> demo
          </span>
        )}
        <EngineChip />
        {/* p99 + change-freeze are scenario theater — demo (unconnected web) only. */}
        {!isDesktop() && !isLocalEngine() && (
          <>
            <span className="hidden items-center gap-1.5 sm:flex">
              <Activity size={12} className="text-accent" /> p99 <span className="font-mono tnum text-secondary">{p99}ms</span>
            </span>
            <span className="hidden items-center gap-1.5 text-warn md:flex">
              <CalendarClock size={12} /> freeze Fri 18:00
            </span>
          </>
        )}
        {runTime && (
          <span className="font-mono tnum text-secondary">
            T+<span className="text-primary">{runTime}</span>
          </span>
        )}
        <Clock />
        <button
          onClick={onOpenCommand}
          title="Command bar"
          className="flex h-8 items-center gap-1.5 rounded-full border border-primary/12 bg-primary/[0.03] pl-2.5 pr-1.5 text-[11.5px] text-secondary transition-colors hover:border-primary/25 hover:text-primary"
        >
          <Command size={12} />
          <kbd className="rounded border border-primary/12 bg-primary/[0.04] px-1 font-mono text-[10px] text-muted">⌘K</kbd>
        </button>
        <ThemeSwitcher theme={theme} onChange={onThemeChange} />
      </div>
    </>
  )
}
