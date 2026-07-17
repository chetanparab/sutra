// Single source of truth for all simulated content.
// One coherent scenario: the atlas-payments platform adds idempotency
// keys to its payment retry flow, closing incident INC-4112's action item.

export const APP_NAME = 'Sutra'
export const APP_TAG = 'Loop-engineering IDE'
export const REPO = 'atlas-payments'
export const BRANCH = 'main'

export const INTENT_ID = 'INT-0042'
export const INTENT_TEXT = 'Add idempotency keys to the payment retry flow.'

export const INTENT_SUGGESTIONS = [
  'Add idempotency keys to the payment retry flow.',
  'Reduce checkout p99 below 300ms.',
  'Migrate refund webhooks to the v2 event bus.',
]

export const INTERPRETATION =
  'Enforce idempotency on payment retries with Redis-backed keys (24h TTL), applied at the shared retry ' +
  'executor so both the legacy v1 queue and the v2 orchestrator are covered. Flag-gated rollout, no schema ' +
  'change, behavior unchanged when no key is supplied.'

export const BLAST_SUMMARY = '8 files · 2 services'

export interface Signal {
  id: string
  name: string
  test: string
  result: string
  req: string
}

export const SIGNALS: Signal[] = [
  {
    id: 'dup-suppress',
    name: 'Duplicate retry produces exactly one charge',
    test: 'retry_idempotency.spec.ts#duplicate-key-single-charge',
    result: '1,000 replays · 0 duplicate charges',
    req: 'FR-2',
  },
  {
    id: 'baseline-compat',
    name: 'Missing key behaves identically to baseline',
    test: 'contract/payment-retry.golden.replay',
    result: 'golden replay · byte-identical',
    req: 'FR-4',
  },
  {
    id: 'ttl-24h',
    name: 'Keys expire at 24h ± 5m',
    test: 'idempotency_store.spec.ts#ttl-window',
    result: 'TTL honored under clock skew',
    req: 'FR-3',
  },
  {
    id: 'p99-overhead',
    name: 'p99 overhead < 5ms on the retry hot path',
    test: 'perf/retry_hotpath.smoke',
    result: '+3.1ms p99 @ 40K TPS replay',
    req: 'NFR-1',
  },
  {
    id: 'no-pii',
    name: 'No new PII in logs or key material',
    test: 'sentinel/policy log-scan',
    result: '0 findings · keys are salted hashes',
    req: 'FR-5',
  },
]

export interface ContextChipData {
  id: string
  title: string
  freshness: string
  live?: boolean
  lines: string[]
  detail: string[]
}

export const CONTEXT_CHIPS: ContextChipData[] = [
  {
    id: 'conventions',
    title: 'Codebase conventions',
    freshness: 'derived 2h ago',
    lines: ['6 active rules · Result<T> error style', 'flags via flipper · no raw throws'],
    detail: [
      'R-01 · errors via Result<T> — no raw throws (98% adherence)',
      'R-02 · feature flags via flipper, kill-switch required',
      'R-03 · money as integer minor units, never floats',
      'R-07 · retry policies centralized in retry/config.ts',
      'Derived from 214 merged PRs · confidence 0.94',
    ],
  },
  {
    id: 'ownership',
    title: 'Ownership graph',
    freshness: 'synced 9m ago',
    lines: ['payments-retry → Team Garuda', 'on-call @asha.r · reviewers 2'],
    detail: [
      'payments-retry → Team Garuda',
      'On-call: @asha.r (until Thu 09:00 IST)',
      'Required reviewers: 1 of @vikram.s, @asha.r',
      'Escalation: #garuda-oncall · SLO owner: garuda',
    ],
  },
  {
    id: 'telemetry',
    title: 'Production telemetry',
    freshness: 'live',
    live: true,
    lines: ['payment-retry p99 412ms · err 0.02%', 'peak 40.2K TPS · redis 61% mem'],
    detail: [
      'payment-retry p99 412ms · p50 88ms',
      'Error rate 0.02% · retry share 3.1% of charges',
      'Peak 40.2K TPS (Fri 19:20 IST)',
      'Redis cluster: 61% mem · 0.4ms RTT',
    ],
  },
  {
    id: 'calendar',
    title: 'Deploy calendar',
    freshness: 'synced 31m ago',
    lines: ['Freeze Fri 18:00 → Mon 06:00 IST', '2 releases queued behind gate'],
    detail: [
      'Change freeze · Fri 18:00 → Mon 06:00 IST',
      'Reason: quarterly settlement close',
      'Queued behind gate: ledger-v2.14, kyc-refresh',
      'Exceptions: sev1 hotfix with VP sign-off only',
    ],
  },
  {
    id: 'incidents',
    title: 'Recent incidents',
    freshness: 'indexed 1d ago',
    lines: ['INC-4112 · duplicate charges in retry storm', 'sev2 · 34d ago · no idempotency'],
    detail: [
      'INC-4112 · sev2 · 34d ago',
      'Duplicate charges during retry storm (₹2.1M refunded)',
      'Root cause: no idempotency on the retry path',
      'Action item AI-88: “add idempotency keys” ← this intent',
    ],
  },
]

export const INTENT_SUMMARY_BULLETS = [
  'Payment retries are now idempotent: a Redis-backed key (sha256 of intent id + attempt window, 24h TTL) is checked-and-set before any charge attempt.',
  'Enforcement lives at the shared RetryExecutor, so both the legacy v1 queue (12.4% of traffic) and the v2 orchestrator pass one choke point.',
  'Zero behavior change until enabled: payments.idempotency_keys defaults off in prod; requests without keys fall through to today’s exact path.',
]

export const RISKS: { label: string; tone: 'ok' | 'warn' }[] = [
  { label: 'Touches hot path — 40K TPS peak', tone: 'warn' },
  { label: 'Freeze window ahead — Fri 18:00 IST', tone: 'warn' },
  { label: 'No schema change', tone: 'ok' },
  { label: 'Backward compatible', tone: 'ok' },
  { label: 'Flag-gated rollout', tone: 'ok' },
]

export interface FileNote {
  path: string
  isNew?: boolean
  added: number
  removed: number
  note: string
}

export const FILE_NOTES: FileNote[] = [
  {
    path: 'services/payments/idempotency/store.ts',
    isNew: true,
    added: 118,
    removed: 0,
    note: 'Redis SETNX key store, 24h TTL; returns prior outcome on duplicate',
  },
  {
    path: 'services/payments/idempotency/derive.ts',
    isNew: true,
    added: 47,
    removed: 0,
    note: 'key = sha256(payment_intent_id · attempt_window) — salted, no PII',
  },
  {
    path: 'services/payments/retry/executor.ts',
    added: 61,
    removed: 14,
    note: 'Enforcement point: check-and-set wraps execute(); suppressed dupes emit metric',
  },
  {
    path: 'services/payments/retry/orchestrator.ts',
    added: 39,
    removed: 12,
    note: 'Threads PaymentContext + flag gate into the executor',
  },
  {
    path: 'services/payments/retry/queue.ts',
    added: 31,
    removed: 8,
    note: 'Legacy v1 path routed through the same guard via adapter',
  },
  {
    path: 'services/payments/api/retry_handler.ts',
    added: 69,
    removed: 14,
    note: 'Accepts + validates Idempotency-Key header, propagates via context',
  },
  {
    path: 'services/payments/config/flags.yaml',
    added: 5,
    removed: 0,
    note: 'payments.idempotency_keys · default off in prod, on in staging',
  },
  {
    path: 'services/payments/retry/retry_idempotency.spec.ts',
    isNew: true,
    added: 182,
    removed: 0,
    note: 'Verifier-authored: 11 cases incl. 64-way SETNX race + clock skew',
  },
]

export const DIFF_TOTALS = '8 files · +552 −48'

export const RAW_DIFF = {
  file: 'services/payments/retry/executor.ts',
  hunk: [
    '@@ -41,8 +41,19 @@ export class RetryExecutor {',
    '   async execute(ctx: PaymentContext): Promise<Result<ChargeOutcome>> {',
    '-    const attempt = this.buildAttempt(ctx)',
    '-    return this.charge.authorize(attempt)',
    '+    const key = deriveIdempotencyKey(ctx.paymentIntentId, ctx.attemptWindow)',
    '+',
    "+    if (flags.enabled('payments.idempotency_keys')) {",
    '+      const held = await this.idempotency.checkAndSet(key, TTL_24H)',
    '+      if (!held.acquired) {',
    "+        metrics.increment('retry.idempotency.duplicate_suppressed')",
    '+        return Result.ok(held.priorOutcome)',
    '+      }',
    '+    }',
    '+',
    '+    const attempt = this.buildAttempt(ctx, key)',
    '+    return this.charge.authorize(attempt)',
    '   }',
  ],
}

// ── Living code surface ─────────────────────────────────────────────────
// The retry executor as the loop actually works it. `hot` lines are the
// synchronous pre-auth GET that blows the p99 budget in iteration 1 — the
// loop removes them in iteration 2 (Hermes memo #1's directive).

export interface CodeLine {
  code: string
  hot?: boolean // removed by the p99 fix in iteration 2
  fresh?: boolean // written fresh this feature
}

export const CODE_FILE = {
  path: 'services/payments/retry/executor.ts',
  tabs: ['executor.ts', 'idempotency/store.ts', 'api/retry_handler.ts'],
  lines: [
    { code: 'export class RetryExecutor {' },
    { code: '  constructor(' },
    { code: '    private charge: ChargeGateway,' },
    { code: '    private idempotency: IdempotencyStore,', fresh: true },
    { code: '  ) {}' },
    { code: '' },
    { code: '  async execute(ctx: PaymentContext): Promise<Result<ChargeOutcome>> {' },
    { code: '    const key = deriveIdempotencyKey(ctx.paymentIntentId, ctx.attemptWindow)', fresh: true },
    { code: '' },
    { code: "    if (flags.enabled('payments.idempotency_keys')) {", fresh: true },
    { code: '      const prior = await this.idempotency.get(key)', hot: true },
    { code: '      if (prior) return Result.ok(prior)', hot: true },
    { code: '      const held = await this.idempotency.checkAndSet(key, TTL_24H)', fresh: true },
    { code: '      if (!held.acquired) {', fresh: true },
    { code: "        metrics.increment('retry.idempotency.duplicate_suppressed')", fresh: true },
    { code: '        return Result.ok(held.priorOutcome)', fresh: true },
    { code: '      }' },
    { code: '    }' },
    { code: '' },
    { code: '    const attempt = this.buildAttempt(ctx, key)' },
    { code: '    return this.charge.authorize(attempt)' },
    { code: '  }' },
    { code: '}' },
  ] as CodeLine[],
}

export const METRICS = {
  specless: { label: 'Specless review', effort: '~3 min', detail: '1 surface · 5 signals' },
  sdd: { label: 'Spec-driven equivalent', effort: '~40 min', detail: '3 documents · 1,286 lines' },
  delta: '≈ 12× less review load',
}

export interface GovCheck {
  id: string
  label: string
  hint: string
}

export const GOVERNANCE_CHECKS: GovCheck[] = [
  { id: 'security', label: 'Security scan', hint: 'semgrep + PCI ruleset over the diff' },
  { id: 'privacy', label: 'Data privacy', hint: 'PII taint pass over new writes and logs' },
  { id: 'freeze', label: 'Change freeze', hint: 'deploy calendar window check' },
  { id: 'audit', label: 'Audit log', hint: 'immutable entry: intent, agents, decisions' },
]

export const POLICY_REF = 'garuda/policies@a41f2c9'

// ── Blast radius mini-map (SVG coordinates) ─────────────────────────────

export interface BlastNode {
  id: string
  label: string
  x: number
  y: number
  w: number
  kind: 'hot' | 'new' | 'dim'
  star?: boolean
}

export const BLAST_NODES: BlastNode[] = [
  { id: 'edge', label: 'checkout-api', x: 8, y: 10, w: 132, kind: 'dim' },
  { id: 'handler', label: 'api/retry_handler', x: 8, y: 58, w: 132, kind: 'hot' },
  { id: 'queue', label: 'retry/queue · v1', x: 8, y: 106, w: 132, kind: 'hot' },
  { id: 'orch', label: 'retry/orchestrator · v2', x: 8, y: 154, w: 132, kind: 'hot' },
  { id: 'ledger', label: 'ledger-service', x: 200, y: 10, w: 116, kind: 'dim' },
  { id: 'exec', label: 'retry/executor', x: 200, y: 82, w: 116, kind: 'hot', star: true },
  { id: 'store', label: 'idempotency/store', x: 200, y: 130, w: 116, kind: 'new' },
  { id: 'redis', label: 'redis · infra', x: 200, y: 178, w: 116, kind: 'dim' },
]

export const BLAST_EDGES: { from: string; to: string; dashed?: boolean }[] = [
  { from: 'edge', to: 'handler' },
  { from: 'handler', to: 'queue' },
  { from: 'handler', to: 'orch' },
  { from: 'queue', to: 'exec' },
  { from: 'orch', to: 'exec' },
  { from: 'exec', to: 'ledger' },
  { from: 'exec', to: 'store', dashed: true },
  { from: 'store', to: 'redis', dashed: true },
]

// ── Spec mode: generated documents (SDD as a first-class workflow) ──────

export const SPEC_META = {
  version: 'Draft v1',
  generatedIn: '42s',
  totalLines: 1286,
}

export interface SpecSection {
  heading: string
  paras?: string[]
  bullets?: { id?: string; text: string }[]
}

export interface SpecDoc {
  id: 'requirements' | 'design' | 'tasks'
  file: string
  lines: number
  summary: string
  sections: SpecSection[]
}

export const SPEC_DOCS: SpecDoc[] = [
  {
    id: 'requirements',
    file: 'requirements.md',
    lines: 412,
    summary: 'User stories with EARS acceptance criteria',
    sections: [
      {
        heading: 'Overview',
        paras: [
          'Payment retries can double-charge customers when the same intent is submitted more than once (INC-4112, ₹2.1M refunded). This feature introduces idempotency keys on the retry path, closing action item AI-88.',
        ],
      },
      {
        heading: 'FR-1 · Key derivation',
        paras: [
          'As a payments platform engineer, I want every retry attempt to carry a stable idempotency key, so that duplicate submissions can be detected deterministically.',
        ],
        bullets: [
          {
            id: 'FR-1.1',
            text: 'WHEN a retry is scheduled, THE SYSTEM SHALL derive the key as sha256(payment_intent_id · attempt_window).',
          },
          {
            id: 'FR-1.2',
            text: 'WHEN the same intent retries within one attempt window, THE SYSTEM SHALL produce an identical key.',
          },
          {
            id: 'FR-1.3',
            text: 'WHEN a client supplies an Idempotency-Key header, THE SYSTEM SHALL prefer it over the derived key after validation.',
          },
        ],
      },
      {
        heading: 'FR-2 · Enforcement',
        paras: [
          'As a payments platform engineer, I want enforcement at a single choke point, so that no retry path can bypass deduplication.',
        ],
        bullets: [
          {
            id: 'FR-2.1',
            text: 'WHEN a charge executes with a key already held, THE SYSTEM SHALL return the prior outcome without re-authorizing.',
          },
          {
            id: 'FR-2.2',
            text: 'WHEN a key is acquired, THE SYSTEM SHALL proceed with exactly one authorization attempt.',
          },
          {
            id: 'FR-2.3',
            text: 'THE SYSTEM SHALL enforce keys on ALL retry paths, including the legacy v1 queue (12.4% of traffic).',
          },
        ],
      },
      {
        heading: 'FR-3 · Expiry',
        bullets: [
          { id: 'FR-3.1', text: 'THE SYSTEM SHALL expire idempotency keys 24h ± 5m after first acquisition.' },
          { id: 'FR-3.2', text: 'WHEN clocks skew up to 5m across nodes, THE SYSTEM SHALL still honor the TTL window.' },
        ],
      },
      {
        heading: 'FR-4 · Backward compatibility',
        bullets: [
          {
            id: 'FR-4.1',
            text: 'WHEN no key is present and the flag is off, THE SYSTEM SHALL behave byte-identically to the current baseline.',
          },
          { id: 'FR-4.2', text: 'THE SYSTEM SHALL gate all behavior behind flag payments.idempotency_keys (default off in prod).' },
          { id: 'FR-4.3', text: 'THE SYSTEM SHALL keep the public contract unchanged; the header remains optional.' },
        ],
      },
      {
        heading: 'FR-5 · Observability & privacy',
        bullets: [
          {
            id: 'FR-5.1',
            text: 'WHEN a duplicate is suppressed, THE SYSTEM SHALL emit retry.idempotency.duplicate_suppressed.',
          },
          { id: 'FR-5.2', text: 'THE SYSTEM SHALL store only salted hashes — no PAN or PII in key material or logs.' },
        ],
      },
      {
        heading: 'NFR-1 · Performance',
        bullets: [
          { id: 'NFR-1.1', text: 'THE SYSTEM SHALL add < 5ms p99 overhead on the retry hot path at 40K TPS peak.' },
        ],
      },
    ],
  },
  {
    id: 'design',
    file: 'design.md',
    lines: 388,
    summary: 'Architecture, data flow, failure modes, rollout',
    sections: [
      {
        heading: 'Approach',
        paras: [
          'A Redis-backed IdempotencyKeyStore is checked-and-set inside RetryExecutor.execute(), the one method both retry paths already share. No schema change; the store is the only new stateful component.',
        ],
      },
      {
        heading: 'Components',
        bullets: [
          { text: 'idempotency/store.ts — SETNX + TTL wrapper over the existing Redis cluster (61% mem headroom).' },
          { text: 'idempotency/derive.ts — pure key derivation, salted sha256, no PII.' },
          { text: 'retry/executor.ts — enforcement guard around authorize().' },
          { text: 'retry/queue.ts (v1) and retry/orchestrator.ts (v2) — pass PaymentContext through unchanged.' },
        ],
      },
      {
        heading: 'Data flow',
        bullets: [
          { text: '1 · retry_handler accepts/validates optional Idempotency-Key header.' },
          { text: '2 · Context carries intent id + attempt window to the executor.' },
          { text: '3 · Executor derives (or adopts) the key and calls checkAndSet.' },
          { text: '4 · Held → return prior outcome; acquired → single authorize, outcome cached.' },
        ],
      },
      {
        heading: 'Failure modes',
        bullets: [
          { text: 'Redis unavailable → fail-open with loud alarm (availability over strictness), counter emitted.' },
          { text: 'Clock skew → TTL window tolerates ±5m; verified by dedicated test.' },
          { text: 'Key collision — 256-bit space; practically impossible, monitored anyway.' },
        ],
      },
      {
        heading: 'Rollout',
        bullets: [
          { text: 'Stage 1 · flag on in staging, Verifier replay suite green.' },
          { text: 'Stage 2 · 5% prod canary for one cycle, watch duplicate_suppressed + p99.' },
          { text: 'Stage 3 · 100% with kill switch retained for two releases.' },
        ],
      },
    ],
  },
  {
    id: 'tasks',
    file: 'tasks.md',
    lines: 486,
    summary: '12 tasks traced to requirements',
    sections: [
      {
        heading: 'Execution plan',
        paras: [
          'Tasks are ordered by dependency; each traces to the requirements it satisfies. Agents execute tasks sequentially per workstream and report evidence per task.',
        ],
      },
    ],
  },
]

// ── Spec mode: task breakdown (execution tracked task-by-task) ──────────

export interface TaskDef {
  id: string
  title: string
  reqs: string[]
  agent: string // sim agent id that performs it
  doneAtStep: number // done once that agent's stepIdx exceeds this index
}

export const TASKS: TaskDef[] = [
  { id: 'T-01', title: 'Scaffold IdempotencyKeyStore (Redis SETNX, TTL 24h)', reqs: ['FR-1', 'FR-3'], agent: 'builder-a', doneAtStep: 0 },
  { id: 'T-02', title: 'Key derivation util + unit tests', reqs: ['FR-1.1', 'FR-1.2'], agent: 'builder-a', doneAtStep: 1 },
  { id: 'T-03', title: 'Wire store into PaymentRetryOrchestrator', reqs: ['FR-2.2'], agent: 'builder-a', doneAtStep: 1 },
  { id: 'T-04', title: 'Feature flag + fallback path', reqs: ['FR-4.2'], agent: 'builder-a', doneAtStep: 2 },
  { id: 'T-05', title: 'Config defaults: off in prod, on in staging', reqs: ['FR-4.2'], agent: 'builder-a', doneAtStep: 2 },
  { id: 'T-06', title: 'Accept + validate Idempotency-Key header', reqs: ['FR-1.3'], agent: 'builder-b', doneAtStep: 0 },
  { id: 'T-07', title: 'Propagate key via PaymentContext', reqs: ['FR-1.3'], agent: 'builder-b', doneAtStep: 0 },
  { id: 'T-08', title: 'Enforce at executor across all retry paths', reqs: ['FR-2.3'], agent: 'builder-b', doneAtStep: 2 },
  { id: 'T-09', title: 'Regenerate contract snapshots', reqs: ['FR-4.3'], agent: 'builder-b', doneAtStep: 3 },
  { id: 'T-10', title: 'Acceptance test suite from signals', reqs: ['FR-1', 'FR-2', 'FR-3', 'FR-4'], agent: 'verifier', doneAtStep: 1 },
  { id: 'T-11', title: 'Perf smoke on the retry hot path', reqs: ['NFR-1.1'], agent: 'verifier', doneAtStep: 2 },
  { id: 'T-12', title: 'Policy scan + audit trail entry', reqs: ['FR-5'], agent: 'sentinel', doneAtStep: 2 },
]
