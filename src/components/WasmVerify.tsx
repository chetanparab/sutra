import { Check, Cpu, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { verifyInWasm, type VerifyResult } from '../wasm/verify'
import { Label, cn } from './ui'

export default function WasmVerify({ fixed }: { fixed: boolean }) {
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    verifyInWasm()
      .then((r) => live && setResult(r))
      .catch((e) => live && setError(String(e?.message ?? e)))
    return () => {
      live = false
    }
  }, [])

  const cur = result ? (fixed ? result.v2 : result.v1) : null

  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between">
        <Label>Verify · WebAssembly</Label>
        <span className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-accent">
          <Cpu size={11} />
          {result ? 'ran live' : error ? 'error' : 'loading'}
        </span>
      </div>

      <p className="mt-2 text-[11.5px] leading-relaxed text-secondary">
        The real retry code, executed in a QuickJS sandbox compiled to WebAssembly — these numbers are computed, not scripted.
      </p>

      {error ? (
        <div className="mt-3 text-[11.5px] text-err">Sandbox failed to load: {error}</div>
      ) : !result || !cur ? (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-muted">
          <Loader2 size={13} className="spin" /> booting the WASM sandbox…
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          <Row
            ok={cur.dedupOk}
            label="Duplicate charges"
            value={`${cur.charges - cur.uniqueIntents} · ${cur.duplicatesSuppressed.toLocaleString()} replays suppressed`}
          />
          <Row
            ok={cur.p99Ok}
            label="p99 overhead (hot path)"
            value={`+${cur.p99Overhead}ms · ${cur.p99Ok ? 'in budget' : 'over 5ms budget'}`}
          />

          {/* the real before/after the loop produced */}
          <div className="mt-1 rounded-[var(--radius)] bg-primary/[0.04] px-3 py-2.5">
            <div className="label mb-1.5">Loop delta · measured</div>
            <div className="flex items-center justify-between font-mono text-[11.5px]">
              <span className="text-muted">redis round-trips / op</span>
              <span>
                <span className="text-warn">{result.v1.hotRtPerOp}</span>
                <span className="text-muted"> → </span>
                <span className="text-ok">{result.v2.hotRtPerOp}</span>
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between font-mono text-[11.5px]">
              <span className="text-muted">p99 overhead</span>
              <span>
                <span className="text-warn">+{result.v1.p99Overhead}ms</span>
                <span className="text-muted"> → </span>
                <span className="text-ok">+{result.v2.p99Overhead}ms</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={cn('mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ring-1', ok ? 'bg-ok/16 ring-ok/35' : 'bg-warn/16 ring-warn/40')}>
        {ok ? <Check size={11} strokeWidth={3} className="text-ok" /> : <X size={11} strokeWidth={3} className="text-warn" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] text-primary">{label}</span>
        <span className="mt-0.5 block font-mono text-[11px] text-muted">{value}</span>
      </span>
    </div>
  )
}
