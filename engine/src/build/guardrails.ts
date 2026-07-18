/**
 * ROADMAP.md Phase 1: "day-one guardrails … not added later." A hard token
 * ceiling and a hard tool-turn ceiling, enforced inside the loop itself — not a
 * UI-layer nicety that can be silently skipped by calling the loop directly.
 */

export type GuardrailKind = 'max-tokens' | 'max-turns'

export class GuardrailViolation extends Error {
  constructor(
    public readonly kind: GuardrailKind,
    message: string,
  ) {
    super(message)
    this.name = 'GuardrailViolation'
  }
}

export interface BuildGuardrails {
  /** Hard stop — total input + output tokens across the whole run. */
  maxTokens: number
  /** Hard stop — number of tool-use round trips within one Build iteration. */
  maxToolTurns: number
}

/**
 * Conservative defaults for a single small-file edit. Deliberately not
 * generous — a real task that needs more should set its own guardrails
 * explicitly, not rely on a permissive default silently covering for it.
 */
export const DEFAULT_GUARDRAILS: BuildGuardrails = {
  maxTokens: 50_000,
  maxToolTurns: 12,
}
