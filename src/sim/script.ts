import type { AgentDef } from './types'

// Scripted timelines for the INT-0042 run. Durations are base values;
// ±15% jitter is applied when a run is instantiated.

export const AGENT_DEFS: AgentDef[] = [
  {
    id: 'scout',
    name: 'Scout',
    role: 'context',
    glyph: '◎',
    wave: 1,
    filesVerb: 'read',
    queuedLine: 'dispatching…',
    startAfter: [],
    startDelay: 400,
    steps: [
      {
        kind: 'work',
        actions: ['Indexing payment-retry call graph…', 'Walking imports from retry_handler.ts…'],
        duration: 3400,
        filesDelta: 14,
        confidenceTo: 0.55,
        decision: {
          text: 'Scoped blast radius to services/payments/retry/* + api/retry_handler.ts',
          reason: 'call-graph fan-out stops at the ledger boundary; 23 files mapped',
        },
      },
      {
        kind: 'work',
        actions: ['Reading INC-4112 postmortem…', 'Extracting dedupe-window requirement…'],
        duration: 2900,
        filesDelta: 3,
        confidenceTo: 0.72,
        decision: {
          text: 'Adopted 24h dedupe window from INC-4112 findings',
          reason: 'retry storms recycled intents for up to 21h in incident data',
        },
      },
      {
        kind: 'work',
        actions: ['Deriving conventions from last 214 merged PRs…'],
        duration: 2800,
        filesDelta: 6,
        confidenceTo: 0.93,
        decision: {
          text: 'Locked conventions: Result<T> errors, flipper flag payments.idempotency_keys',
          reason: 'matches 96% of recent payments-service PRs',
        },
      },
    ],
    terminal: 'done',
    terminalNote: 'Context pack sealed · 5 chips · 23 files · 2 constraints',
  },
  {
    id: 'builder-a',
    name: 'Builder A',
    role: 'store & orchestrator',
    glyph: '◆',
    wave: 2,
    filesVerb: 'touched',
    queuedLine: 'starts after Scout seals context',
    startAfter: [{ id: 'scout', reaches: 'done' }],
    startDelay: 600,
    steps: [
      {
        kind: 'work',
        actions: ['Scaffolding IdempotencyKeyStore (Redis, SETNX, TTL 24h)…'],
        duration: 4600,
        filesDelta: 2,
        confidenceTo: 0.5,
        decision: {
          text: 'Chose Redis SETNX + TTL over a Postgres table',
          reason: 'no schema change; survives instance restarts; matches infra chip',
        },
      },
      {
        kind: 'work',
        actions: [
          'Deriving keys: sha256(intent_id · attempt_window)…',
          'Wiring store into PaymentRetryOrchestrator…',
        ],
        duration: 5200,
        filesDelta: 2,
        confidenceTo: 0.74,
        decision: {
          text: 'Key = sha256(payment_intent_id · attempt_window)',
          reason: 'stable across client retries; rotates naturally per window',
        },
      },
      {
        kind: 'work',
        actions: ['Adding flag payments.idempotency_keys + fallback path…'],
        duration: 3800,
        filesDelta: 1,
        confidenceTo: 0.9,
        decision: {
          text: 'Flag defaults OFF in prod, ON in staging',
          reason: 'bake behind flag until Verifier replay + one canary cycle',
        },
      },
    ],
    terminal: 'needs-review',
    terminalNote: 'Diff ready · 5 files · +209 −26',
  },
  {
    id: 'builder-b',
    name: 'Builder B',
    role: 'api surface',
    glyph: '◆',
    wave: 2,
    filesVerb: 'touched',
    queuedLine: 'starts after Scout seals context',
    startAfter: [{ id: 'scout', reaches: 'done' }],
    startDelay: 1400,
    steps: [
      {
        kind: 'work',
        actions: ['Threading Idempotency-Key header through retry_handler…'],
        duration: 5000,
        filesDelta: 2,
        confidenceTo: 0.58,
        decision: {
          text: 'Header accepted at the edge, propagated via PaymentContext',
          reason: 'mirrors the checkout-api pattern Scout surfaced',
        },
      },
      {
        kind: 'conflict',
        conflict: {
          title: 'Two live retry paths',
          body:
            'RetryQueue (legacy v1) still serves 12.4% of retries via mobile SDK ≤ 4.2. Keying only ' +
            'PaymentRetryOrchestrator (v2) leaves v1 exposed to an INC-4112 recurrence. Where should ' +
            'enforcement live?',
          options: [
            {
              id: 'both',
              label: 'Enforce at shared RetryExecutor.execute()',
              detail: '+2 files · covers v1 + v2 · single choke point',
              recommended: true,
              extraFiles: 2,
              decision: {
                text: 'Human: enforce at shared RetryExecutor.execute()',
                reason: 'covers v1 + v2 (100% of retries); one choke point to audit',
                human: true,
              },
            },
            {
              id: 'v2-only',
              label: 'V2 only · tag v1 with unkeyed-retry telemetry',
              detail: '+1 file · 12.4% of retries stay unkeyed',
              extraFiles: 1,
              decision: {
                text: 'Human: v2-only enforcement; v1 tagged with unkeyed-retry telemetry',
                reason: 'accepts residual risk until mobile SDK ≤ 4.2 sunsets',
                human: true,
              },
            },
          ],
        },
      },
      {
        kind: 'work',
        actions: ['Applying enforcement at the chosen boundary…', 'Adapting legacy path via guard shim…'],
        duration: 5400,
        confidenceTo: 0.82,
        decision: {
          text: 'Contract surface unchanged — Idempotency-Key header is optional',
          reason: 'goldens regenerate byte-identical when no key is sent',
        },
      },
      {
        kind: 'work',
        actions: ['Regenerating contract snapshots…'],
        duration: 2900,
        confidenceTo: 0.88,
      },
    ],
    terminal: 'needs-review',
    terminalNote: 'Diff ready · 4 files · +161 −22',
  },
  {
    id: 'verifier',
    name: 'Verifier',
    role: 'tests & evals',
    glyph: '◈',
    wave: 3,
    filesVerb: 'touched',
    queuedLine: 'starts after both Builders hand off',
    startAfter: [
      { id: 'builder-a', reaches: 'needs-review' },
      { id: 'builder-b', reaches: 'needs-review' },
    ],
    startDelay: 500,
    steps: [
      {
        kind: 'work',
        actions: ['Generating tests from acceptance signals…'],
        duration: 4200,
        filesDelta: 1,
        confidenceTo: 0.6,
        decision: {
          text: '5 signals → 11 test cases (incl. clock-skew TTL edge)',
          reason: 'every acceptance signal must be machine-checkable',
        },
      },
      {
        kind: 'work',
        actions: ['Replaying 1,000 duplicate retry attempts…', 'Racing SETNX under 64-way concurrency…'],
        duration: 5200,
        confidenceTo: 0.84,
        decision: {
          text: '0 duplicate charges across 1,000 keyed replays',
          reason: 'SETNX race verified under 64-way concurrency',
        },
      },
      {
        kind: 'work',
        actions: ['Perf smoke on retry hot path…'],
        duration: 3600,
        confidenceTo: 0.96,
        decision: {
          text: 'p99 overhead +3.1ms (budget 5ms) at 40K TPS replay',
          reason: 'single Redis round-trip, pipelined with charge auth',
        },
      },
    ],
    terminal: 'done',
    terminalNote: 'All 5 signals green · spec +182 lines',
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    role: 'policy checks',
    glyph: '⬢',
    wave: 2,
    filesVerb: 'checked',
    queuedLine: 'starts after Scout seals context',
    startAfter: [{ id: 'scout', reaches: 'done' }],
    startDelay: 2000,
    steps: [
      {
        kind: 'work',
        actions: ['Scanning diff stream for PII / PCI scope changes…'],
        duration: 5800,
        filesDelta: 8,
        confidenceTo: 0.7,
        decision: {
          text: 'No PAN/PII in key material — salted hashes only',
          reason: 'log-scan + taint pass over all new writes',
        },
      },
      {
        kind: 'work',
        actions: ['Checking deploy calendar & change freeze…'],
        duration: 3200,
        filesDelta: 2,
        confidenceTo: 0.8,
        decision: {
          text: '⚠ Freeze window Fri 18:00 IST intersects rollout',
          reason: 'deploy-calendar chip; will surface at the governance gate',
          warn: true,
        },
      },
      {
        kind: 'work',
        actions: ['Writing audit trail for INT-0042…'],
        duration: 2600,
        filesDelta: 1,
        confidenceTo: 0.97,
        decision: {
          text: 'Audit entry sealed: intent, agents, context reads, decisions',
          reason: 'required by garuda/policies@a41f2c9',
        },
      },
    ],
    terminal: 'done',
    terminalNote: 'Policies pre-checked · 1 flag raised for gate',
  },
]
