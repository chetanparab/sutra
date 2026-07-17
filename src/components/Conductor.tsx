import { CornerDownLeft, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from './ui'

export interface Command {
  id: string
  group: string
  label: string
  hint?: string
  icon: React.ReactNode
  keywords?: string
  run: () => void
}

// lightweight subsequence fuzzy score — higher is better, -1 = no match
function score(text: string, q: string): number {
  if (!q) return 0
  text = text.toLowerCase()
  let ti = 0
  let s = 0
  let streak = 0
  for (const ch of q.toLowerCase()) {
    const found = text.indexOf(ch, ti)
    if (found === -1) return -1
    streak = found === ti ? streak + 2 : 0
    s += 3 + streak - Math.min(found - ti, 4)
    ti = found + 1
  }
  return s
}

export default function Conductor({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  const results = useMemo(() => {
    if (!q.trim()) return commands
    return commands
      .map((c) => ({ c, s: score(`${c.label} ${c.keywords ?? ''} ${c.group}`, q.trim()) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c)
  }, [commands, q])

  useEffect(() => {
    setIdx((i) => Math.min(i, Math.max(0, results.length - 1)))
  }, [results.length])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  if (!open) return null

  const run = (c?: Command) => {
    if (!c) return
    c.run()
    onClose()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdx((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(results[idx])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // group in first-seen order
  const groups: { name: string; items: { c: Command; gi: number }[] }[] = []
  results.forEach((c, gi) => {
    let g = groups.find((x) => x.name === c.group)
    if (!g) groups.push((g = { name: c.group, items: [] }))
    g.items.push({ c, gi })
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[14vh]" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/35" style={{ backdropFilter: 'blur(3px)' }} />
      <div
        className="surface anim-rise relative w-full max-w-[560px] overflow-hidden"
        style={{ borderRadius: '18px' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-primary/10 px-4">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Steer Sutra — jump, switch theme, tune the loop…"
            spellCheck={false}
            className="flex-1 bg-transparent py-4 font-display text-[15px] text-primary outline-none placeholder:font-normal placeholder:text-muted"
          />
          <kbd className="rounded-md border border-primary/12 bg-primary/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-muted">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12.5px] text-muted">Nothing matches “{q}”.</div>
          ) : (
            groups.map((g) => (
              <div key={g.name} className="mb-1">
                <div className="label px-2.5 py-1.5">{g.name}</div>
                {g.items.map(({ c, gi }) => (
                  <button
                    key={c.id}
                    data-active={gi === idx}
                    onMouseEnter={() => setIdx(gi)}
                    onClick={() => run(c)}
                    className={cn('flex w-full items-center gap-3 rounded-[var(--radius)] px-2.5 py-2 text-left transition-colors', gi === idx ? 'bg-accent/[0.1]' : 'hover:bg-primary/[0.04]')}
                  >
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', gi === idx ? 'bg-accent/15 text-accent' : 'bg-primary/[0.05] text-secondary')}>{c.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-primary">{c.label}</span>
                      {c.hint && <span className="block truncate text-[10.5px] text-muted">{c.hint}</span>}
                    </span>
                    {gi === idx && <CornerDownLeft size={13} className="shrink-0 text-muted" />}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-primary/10 px-4 py-2 text-[10.5px] text-muted">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-primary/12 px-1 font-mono">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-primary/12 px-1 font-mono">↵</kbd> run
          </span>
          <span className="ml-auto font-display italic">Conductor</span>
        </div>
      </div>
    </div>
  )
}
