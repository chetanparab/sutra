/**
 * Merge, real mode — the frozen invariant as a surface: nothing lands until
 * this click, and this click only ever fast-forwards (or rebases then
 * fast-forwards). A conflict or dirty worktree comes back as a written
 * refusal from the engine, rendered verbatim; there is no force option.
 */
import { GitMerge, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button, Label, Slab, cn } from '../components/ui'
import { mergeBranch, type MergeClickResult } from '../desktop/realLoop'
import { isDesktop } from '../desktop/engine'
import { isLocalEngine, mergeBranchHttp } from '../desktop/localEngine'
import type { RealRunMeta } from '../loop/useRealLoop'

const FIELD =
  'rounded-[var(--radius)] border border-primary/12 bg-primary/[0.03] px-3 py-2 font-mono text-[11.5px] text-primary outline-none transition-colors placeholder:text-faint focus:border-accent/50'

export default function RealMergeView({ meta }: { meta: RealRunMeta }) {
  const [target, setTarget] = useState('main')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MergeClickResult | null>(null)

  const merge = async () => {
    if (!meta.branchName) return
    setBusy(true)
    try {
      const doMerge = !isDesktop() && isLocalEngine() ? mergeBranchHttp : mergeBranch
      setResult(await doMerge(meta.workspacePath, meta.branchName, target.trim()))
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-6 pb-28 pt-20">
        <div className="anim-rise">
          <Label>Merge — human-gated</Label>
          <h1 className="serif-hero mt-3.5 font-display text-[clamp(26px,3.4vw,34px)] font-semibold leading-[1.05] tracking-[-0.03em]">
            Land it — <span className="italic font-medium text-accent">your click is the gate</span>
          </h1>
          <p className="pretty mt-2.5 max-w-[58ch] text-[13.5px] leading-[1.6] text-secondary">
            Fast-forward <span className="font-mono text-[12px] text-primary">{meta.branchName ?? '…'}</span> into the branch below.
            If the target moved on, the engine rebases and fast-forwards; conflicts come back as a refusal, never a force.
          </p>
        </div>

        <Slab
          className="anim-rise mt-6"
          title={
            <span className="flex items-center gap-1.5">
              <GitMerge size={12} className="text-muted" /> <Label tick={false}>Target branch</Label>
            </span>
          }
          bodyClassName="space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <input value={target} onChange={(e) => setTarget(e.target.value)} className={cn(FIELD, 'flex-1')} placeholder="main" />
            <Button variant="primary" disabled={busy || !meta.branchName || target.trim() === '' || result?.ok === true} onClick={merge}>
              <GitMerge size={13} /> {busy ? 'Merging…' : result?.ok ? 'Merged' : 'Merge now'}
            </Button>
          </div>

          {result && (
            <div
              className={cn(
                'flex items-start gap-2.5 rounded-[var(--radius)] border p-3 text-[12px] leading-relaxed',
                result.ok ? 'border-ok/25 bg-ok/[0.06] text-secondary' : 'border-warn/30 bg-warn/[0.07] text-secondary',
              )}
            >
              {result.ok ? <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ok" /> : <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />}
              <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-[11px]">{result.message}</pre>
            </div>
          )}

          <p className="border-t border-primary/10 pt-3 text-[11px] leading-snug text-muted">
            The shadow branch stays after a merge — delete it whenever you like. A refusal leaves everything exactly as it
            was, including your worktree.
          </p>
        </Slab>
      </div>
    </div>
  )
}
