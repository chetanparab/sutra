/**
 * Review, real mode: the actual diff the loop committed to the shadow branch,
 * with the run's honest numbers. No scenario content — what you see is what
 * `git diff` said. Approval here only unlocks the merge surface; nothing
 * lands until the merge click itself.
 */
import { Check, Eye, GitBranch, RotateCcw } from 'lucide-react'
import { Button, Label, Slab } from '../components/ui'
import type { RealRunMeta } from '../loop/useRealLoop'

function DiffBlock({ diff }: { diff: string }) {
  return (
    <pre className="max-h-[46vh] overflow-auto rounded-[var(--radius)] border border-primary/10 bg-primary/[0.03] p-4 font-mono text-[11px] leading-[1.55] text-secondary">
      {diff.split('\n').map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith('+') && !line.startsWith('+++')
              ? 'text-ok'
              : line.startsWith('-') && !line.startsWith('---')
                ? 'text-err'
                : line.startsWith('@@')
                  ? 'text-accent'
                  : undefined
          }
        >
          {line || ' '}
        </div>
      ))}
    </pre>
  )
}

export default function RealReviewView({
  meta,
  iterations,
  costUsd,
  approved,
  onApprove,
  onRequestChanges,
}: {
  meta: RealRunMeta
  iterations: number
  costUsd: number | null
  approved: boolean
  onApprove: () => void
  onRequestChanges: () => void
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 pb-28 pt-20">
        <div className="anim-rise">
          <Label>Review — real change</Label>
          <h1 className="serif-hero mt-3.5 font-display text-[clamp(26px,3.4vw,34px)] font-semibold leading-[1.05] tracking-[-0.03em]">
            The loop's actual diff, <span className="italic font-medium text-accent">nothing staged</span>
          </h1>
          <p className="pretty mt-2.5 max-w-[62ch] text-[13.5px] leading-[1.6] text-secondary">
            Converged in {iterations} iteration{iterations === 1 ? '' : 's'}
            {costUsd !== null ? <> · ~${costUsd.toFixed(costUsd < 0.1 ? 3 : 2)} actual model spend</> : null} · committed to{' '}
            <span className="font-mono text-[12px] text-primary">{meta.branchName ?? 'the shadow branch'}</span>. Your branch is untouched
            until you merge.
          </p>
        </div>

        <Slab
          className="anim-rise mt-6"
          title={
            <span className="flex items-center gap-1.5">
              <Eye size={12} className="text-muted" /> <Label tick={false}>Diff since branch point</Label>
            </span>
          }
        >
          {meta.diff ? <DiffBlock diff={meta.diff} /> : <p className="text-[12px] text-muted">The run produced no diff.</p>}
        </Slab>

        <div className="mt-6 flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <GitBranch size={12} className="text-accent" /> {meta.workspacePath}
          </span>
          <div className="flex items-center gap-2.5">
            <Button onClick={onRequestChanges}>
              <RotateCcw size={13} /> Request changes
            </Button>
            <Button variant="primary" disabled={approved} onClick={onApprove}>
              <Check size={13} /> {approved ? 'Approved' : 'Approve for merge'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
