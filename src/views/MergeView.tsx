import { Circle, GitMerge, Lock } from 'lucide-react'
import { Button, Chip, Label, Slab } from '../components/ui'
import { GOVERNANCE_CHECKS, INTENT_ID, POLICY_REF } from '../scenario'

export default function MergeView({ reviewApproved }: { reviewApproved: boolean }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-xl px-6 pb-28 pt-24">
        <div className="mb-1 flex items-center gap-2.5">
          <GitMerge size={16} className="text-secondary" />
          <Label tick={false}>Governance gate</Label>
          <Chip tone={reviewApproved ? 'info' : 'neutral'} className="ml-auto">
            {reviewApproved ? 'ready to run' : 'awaiting approval'}
          </Chip>
        </div>
        <p className="mb-5 text-[12.5px] leading-relaxed text-secondary">
          Policy-as-code from <span className="font-mono text-[11.5px]">{POLICY_REF}</span> runs before {INTENT_ID} can merge. Checks execute automatically after approval — nothing merges on vibes.
        </p>

        <Slab bodyClassName="p-0">
          {GOVERNANCE_CHECKS.map((check, i) => (
            <div key={check.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-primary/[0.07]' : ''}`}>
              <Circle size={14} className="text-primary/20" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-primary">{check.label}</div>
                <div className="text-[11.5px] text-muted">{check.hint}</div>
              </div>
              <span className="text-[11px] text-muted">{reviewApproved ? 'queued' : 'idle'}</span>
            </div>
          ))}
        </Slab>

        <div className="mt-4">
          <Button variant="primary" disabled className="w-full">
            <Lock size={12} /> Merge to main
          </Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted">An immutable audit entry (intent, agents, context reads, decisions) is written either way.</p>
      </div>
    </div>
  )
}
