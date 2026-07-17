import { Check, Cpu, Loader2, Play, X } from 'lucide-react'
import { useState } from 'react'
import type { VerifyResult } from '../wasm/verify'
import { Label, cn } from '../components/ui'

type Phase = 'idle' | 'booting' | 'done' | 'failed'

// Runs the actual retry/idempotency code in the QuickJS-WASM sandbox, right
// here on the landing page. The module (and the .wasm) load only on click.
export default function LiveWasmDemo() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [ms, setMs] = useState(0)

  const run = async () => {
    setPhase('booting')
    const t0 = performance.now()
    try {
      const { verifyInWasm } = await import('../wasm/verify')
      const r = await verifyInWasm()
      setMs(Math.round(performance.now() - t0))
      setResult(r)
      setPhase('done')
    } catch {
      setPhase('failed')
    }
  }

  return (
    <div className="surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-primary/10 px-5 py-4">
        <Label tick={false}>
          <Cpu size={12} className="mr-1 inline text-accent" /> Live sandbox
        </Label>
        <span className="text-[12px] text-muted">quickjs.wasm · loads on demand · runs offline</span>
        <button
          onClick={run}
          disabled={phase === 'booting'}
          className={cn(
            'ml-auto inline-flex h-10 items-center gap-2 rounded-[var(--radius)] px-4 text-[13px] font-medium transition-all active:scale-[0.985]',
            phase === 'done' ? 'border border-primary/15 text-secondary hover:text-primary' : 'bg-accent text-accentink lift hover:brightness-[1.06]',
            phase === 'booting' && 'opacity-60',
          )}
        >
          {phase === 'booting' ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
          {phase === 'idle' && 'Run 1,000 replays in WebAssembly'}
          {phase === 'booting' && 'Booting the sandbox…'}
          {phase === 'done' && 'Run it again'}
          {phase === 'failed' && 'Retry'}
        </button>
      </div>

      <div className="grid gap-px sm:grid-cols-2" style={{ background: 'var(--hairline)' }}>
        <Variant
          title="Iteration 1 · naive"
          sub="pre-auth GET before authorize()"
          data={result?.v1 ?? null}
          phase={phase}
        />
        <Variant title="Iteration 2 · converged" sub="SETNX only — round-trip removed" data={result?.v2 ?? null} phase={phase} good />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3 text-[11.5px] text-muted">
        {phase === 'done' && result ? (
          <>
            <span className="flex items-center gap-1.5 text-ok">
              <Check size={12} /> computed in your browser, just now — {ms} ms total
            </span>
            <span className="font-mono">{result.engine}</span>
          </>
        ) : phase === 'failed' ? (
          <span className="text-err">This browser blocked WebAssembly — try a current Chrome, Edge, Firefox or Safari.</span>
        ) : (
          <span>Nothing here is pre-recorded: the numbers appear only after the code actually executes.</span>
        )}
      </div>
    </div>
  )
}

function Variant({
  title,
  sub,
  data,
  phase,
  good,
}: {
  title: string
  sub: string
  data: VerifyResult['v1'] | null
  phase: Phase
  good?: boolean
}) {
  return (
    <div className="bg-panel px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="font-display text-[14px] font-semibold">{title}</span>
        {data &&
          (data.p99Ok ? (
            <span className="flex items-center gap-1 rounded-full border border-ok/30 bg-ok/10 px-2 py-0.5 text-[10.5px] font-medium text-ok">
              <Check size={10} /> in budget
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full border border-warn/35 bg-warn/10 px-2 py-0.5 text-[10.5px] font-medium text-warn">
              <X size={10} /> over budget
            </span>
          ))}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-muted">{sub}</div>

      <div className="mt-3 space-y-1.5 font-mono text-[12px] tnum">
        <Row k="duplicate charges" v={data ? String(data.charges - data.uniqueIntents) : null} phase={phase} tone={data ? 'ok' : undefined} />
        <Row k="replays suppressed" v={data ? data.duplicatesSuppressed.toLocaleString() : null} phase={phase} />
        <Row k="redis round-trips / op" v={data ? String(data.hotRtPerOp) : null} phase={phase} tone={data ? (good ? 'ok' : 'warn') : undefined} />
        <Row k="p99 overhead" v={data ? `+${data.p99Overhead}ms` : null} phase={phase} tone={data ? (data.p99Ok ? 'ok' : 'warn') : undefined} />
      </div>
    </div>
  )
}

function Row({ k, v, phase, tone }: { k: string; v: string | null; phase: Phase; tone?: 'ok' | 'warn' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className={cn(tone === 'ok' && 'text-ok', tone === 'warn' && 'text-warn', !tone && 'text-primary')}>
        {v ?? (phase === 'booting' ? '…' : '—')}
      </span>
    </div>
  )
}
