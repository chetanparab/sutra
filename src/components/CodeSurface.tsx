import { Feather } from 'lucide-react'
import type { ReactNode } from 'react'
import { CODE_FILE } from '../scenario'
import type { LoopPhase, LoopStatus } from '../loop/types'
import { cn } from './ui'

// ── tiny TS highlighter — theme-token colored ────────────────────────────
const TOKEN =
  /(\/\/.*)|('(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(export|class|const|let|async|await|return|if|else|new|private|import|from|interface|type|void|Promise)\b|\b(\d+[\w]*)\b|([A-Za-z_$][\w$]*)(?=\()|\b(this)\b/g

function highlight(code: string): ReactNode {
  if (code.trim() === '') return ' '
  const out: ReactNode[] = []
  let last = 0
  let k = 0
  let m: RegExpExecArray | null
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(code))) {
    if (m.index > last) out.push(<span key={k++}>{code.slice(last, m.index)}</span>)
    const [full, comment, str, kw, num, fn, ths] = m
    const cls = comment ? 'text-muted italic' : str ? 'text-ok' : kw ? 'text-accent' : num ? 'text-warn' : fn ? 'text-info' : ths ? 'text-secondary italic' : ''
    out.push(
      <span key={k++} className={cls}>
        {full}
      </span>,
    )
    last = m.index + full.length
  }
  if (last < code.length) out.push(<span key={k++}>{code.slice(last)}</span>)
  return out
}

function Cursor({ name, tone }: { name: string; tone: string }) {
  return (
    <span className="ml-1 inline-flex items-center align-middle">
      <span className="caret-blink inline-block h-[15px] w-[2px] rounded-full" style={{ background: tone }} />
      <span className="ml-1 rounded px-1.5 py-[1px] text-[9px] font-semibold text-white" style={{ background: tone }}>
        {name}
      </span>
    </span>
  )
}

export default function CodeSurface({
  phase,
  iteration,
  fraction,
  status,
}: {
  phase: LoopPhase
  iteration: number
  fraction: number
  status: LoopStatus
}) {
  const lines = CODE_FILE.lines
  const running = status === 'running'
  const done = status === 'converged' || status === 'accepted'
  const iter1Build = iteration === 1 && phase === 'build' && running

  const revealCount = iter1Build ? Math.max(7, Math.ceil(fraction * lines.length)) : lines.length
  const removedFrac = done ? 1 : iteration < 2 ? 0 : phase === 'sense' ? 0 : phase === 'build' ? fraction : 1
  const p99Fixed = removedFrac > 0.5 || done

  const sigIdx = lines.findIndex((l) => l.code.includes('async execute'))
  const casIdx = lines.findIndex((l) => l.code.includes('checkAndSet'))
  const hotIdx = lines.findIndex((l) => l.hot)
  const showCursors = phase === 'build' && running
  const aIdx = iter1Build ? revealCount - 1 : iteration >= 2 ? hotIdx : casIdx
  const bIdx = sigIdx

  const accent = 'var(--color-accent)'
  const info = 'var(--color-info)'

  return (
    <div className="surface flex w-full max-w-[780px] flex-col overflow-hidden">
      {/* tab bar */}
      <div className="flex items-center gap-1 border-b border-primary/10 px-2.5 pt-2.5">
        {CODE_FILE.tabs.map((t, i) => (
          <span
            key={t}
            className={cn(
              'rounded-t-lg px-3.5 py-2 font-mono text-[12.5px]',
              i === 0 ? 'bg-primary/[0.06] text-primary' : 'text-muted',
            )}
          >
            {t}
            {i === 0 && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />}
          </span>
        ))}
      </div>

      {/* header: path + live perf */}
      <div className="flex items-center gap-2.5 border-b border-primary/10 px-4 py-2.5">
        <span className="truncate font-mono text-[12px] text-secondary">{CODE_FILE.path}</span>
        {showCursors && (
          <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent soft-pulse" />
            Builder A · B live
          </span>
        )}
        <span
          className={cn(
            'ml-auto rounded-full border px-2.5 py-1 font-mono text-[11.5px] font-medium',
            p99Fixed ? 'border-ok/35 bg-ok/12 text-ok' : 'border-warn/35 bg-warn/12 text-warn',
          )}
        >
          {p99Fixed ? 'p99 +3.1ms · in budget' : 'p99 +7.2ms · over budget'}
        </span>
      </div>

      {/* code */}
      <div className="overflow-x-auto py-3.5 font-mono text-[14px] leading-[1.95]">
        {lines.slice(0, revealCount).map((line, i) => {
          const removing = line.hot && removedFrac > 0
          const style: React.CSSProperties = line.hot
            ? {
                opacity: 1 - removedFrac * 0.92,
                maxHeight: removedFrac >= 1 ? 0 : 30,
                overflow: 'hidden',
                transition: 'opacity 0.35s ease, max-height 0.35s ease',
              }
            : {}
          const marker = line.hot ? '−' : line.fresh ? '+' : ''
          return (
            <div
              key={i}
              style={style}
              className={cn(
                'group flex items-start px-1',
                i === revealCount - 1 && iter1Build && 'type-in',
                removing && 'bg-err/[0.07]',
                line.hot && removedFrac === 0 && 'bg-warn/[0.05]',
              )}
            >
              <span className="w-11 shrink-0 select-none pr-4 text-right text-[12px] text-muted tnum">{i + 1}</span>
              <span className={cn('w-4 shrink-0 select-none text-center text-[13px] font-semibold', line.hot ? 'text-err' : line.fresh ? 'text-ok' : 'text-transparent')}>{marker}</span>
              <span className={cn('min-w-0 whitespace-pre text-primary', removing && 'line-through decoration-err/70')}>
                {highlight(line.code)}
                {showCursors && i === aIdx && <Cursor name="Builder A" tone={accent} />}
                {showCursors && i === bIdx && i !== aIdx && <Cursor name="Builder B" tone={info} />}
              </span>
            </div>
          )
        })}
      </div>

      {/* footer: what the loop is doing to the code */}
      <div className="flex items-center gap-2 border-t border-primary/10 px-4 py-2.5 text-[12.5px] font-medium">
        {iteration >= 2 && !done && removedFrac > 0 && removedFrac < 1 ? (
          <span className="flex items-center gap-1.5 text-err">
            <Feather size={12} className="text-accent" /> Applying memo #1 — dropping the pre-auth GET
          </span>
        ) : done ? (
          <span className="flex items-center gap-1.5 text-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Converged · −2 lines · synchronous round-trip removed
          </span>
        ) : iter1Build ? (
          <span className="flex items-center gap-1.5 text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent soft-pulse" /> Builders writing the enforcement guard…
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-warn">
            <span className="h-1.5 w-1.5 rounded-full bg-warn" /> Pre-auth GET adds a synchronous round-trip — over p99 budget
          </span>
        )}
      </div>
    </div>
  )
}
