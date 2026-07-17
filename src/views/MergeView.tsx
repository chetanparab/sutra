import { Check, GitMerge, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Chip, Label, Slab } from '../components/ui'
import { AUDIT_REF, GOVERNANCE_CHECKS, INTENT_ID, MERGE_BRANCH, POLICY_REF } from '../scenario'

type CheckStatus = 'idle' | 'queued' | 'running' | 'passed'

export default function MergeView({ reviewApproved }: { reviewApproved: boolean }) {
  const [statuses, setStatuses] = useState<CheckStatus[]>(() => GOVERNANCE_CHECKS.map(() => 'idle'))
  const [merged, setMerged] = useState(false)

  // After approval, the policy checks run for real: queued → running → passed,
  // one after another. Merge only unlocks once every gate is green.
  useEffect(() => {
    if (!reviewApproved) {
      setStatuses(GOVERNANCE_CHECKS.map(() => 'idle'))
      return
    }
    setStatuses(GOVERNANCE_CHECKS.map(() => 'queued'))
    const timers: ReturnType<typeof setTimeout>[] = []
    GOVERNANCE_CHECKS.forEach((_, i) => {
      const at = 450 + i * 720
      timers.push(setTimeout(() => setStatuses((s) => s.map((v, j) => (j === i ? 'running' : v))), at))
      timers.push(setTimeout(() => setStatuses((s) => s.map((v, j) => (j === i ? 'passed' : v))), at + 560))
    })
    return () => timers.forEach(clearTimeout)
  }, [reviewApproved])

  const passedCount = statuses.filter((s) => s === 'passed').length
  const allPassed = passedCount === GOVERNANCE_CHECKS.length

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-xl px-6 pb-28 pt-24">
        <div className="mb-1 flex items-center gap-2.5">
          <GitMerge size={16} className="text-secondary" />
          <Label tick={false}>Governance gate</Label>
          <Chip tone={merged ? 'ok' : allPassed ? 'ok' : reviewApproved ? 'info' : 'neutral'} className="ml-auto">
            {merged ? 'merged' : allPassed ? 'all gates green' : reviewApproved ? `${passedCount}/${GOVERNANCE_CHECKS.length} passing` : 'awaiting approval'}
          </Chip>
        </div>
        <p className="mb-5 text-[12.5px] leading-relaxed text-secondary">
          Policy-as-code from <span className="font-mono text-[11.5px]">{POLICY_REF}</span> runs before {INTENT_ID} can merge. Checks execute automatically after approval — nothing merges on vibes.
        </p>

        <Slab bodyClassName="p-0">
          {GOVERNANCE_CHECKS.map((check, i) => {
            const st = statuses[i]
            return (
              <div key={check.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-primary/[0.07]' : ''}`}>
                {st === 'passed' ? (
                  <Check size={14} className="shrink-0 text-ok" />
                ) : st === 'running' ? (
                  <Loader2 size={14} className="spin shrink-0 text-accent" />
                ) : (
                  <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${st === 'queued' ? 'border-primary/30' : 'border-primary/15'}`} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-primary">{check.label}</div>
                  <div className="text-[11.5px] text-muted">{check.hint}</div>
                </div>
                <span className={`text-[11px] ${st === 'passed' ? 'text-ok' : st === 'running' ? 'text-accent' : 'text-muted'}`}>
                  {st === 'passed' ? check.result : st === 'running' ? 'running…' : st === 'queued' ? 'queued' : 'idle'}
                </span>
              </div>
            )
          })}
        </Slab>

        {!merged ? (
          <>
            <div className="mt-4">
              <Button variant="primary" disabled={!allPassed} onClick={() => setMerged(true)} className="w-full">
                {allPassed ? <GitMerge size={13} /> : <Lock size={12} />} Merge to main
              </Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted">
              {allPassed
                ? 'All four gates passed. Merging writes the change behind its flag.'
                : reviewApproved
                  ? 'Merge unlocks once every policy check is green.'
                  : 'An immutable audit entry (intent, agents, context reads, decisions) is written either way.'}
            </p>
          </>
        ) : (
          <div className="anim-rise mt-4">
            <Slab>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok/12 text-ok">
                  <ShieldCheck size={16} />
                </span>
                <div className="min-w-0">
                  <div className="font-display text-[15px] font-semibold text-primary">Merged to main</div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-secondary">
                    {INTENT_ID} merged behind <span className="font-mono text-[11.5px]">payments.idempotency_keys</span> — off in production until you flip it. All four gates green.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-primary/10 pt-3 font-mono text-[11px] text-muted">
                    <span>{MERGE_BRANCH} → main</span>
                    <span>audit #{AUDIT_REF}</span>
                    <span className="text-ok">immutable · signed</span>
                  </div>
                </div>
              </div>
            </Slab>
            <p className="mt-2 text-center text-[11px] text-muted">The audit entry records the intent, every agent, the context reads and each decision.</p>
          </div>
        )}
      </div>
    </div>
  )
}
