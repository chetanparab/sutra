/**
 * A pre-run cost estimate can only honestly be a worst-case ceiling — nobody
 * knows how many tokens a conversation will actually use before it happens.
 * This reports "up to ~$X for this run" based on the maxTokens guardrail, not a
 * false precise prediction. After a run, report the *actual* usage instead —
 * see reportActualCost below.
 *
 * Pricing drifts; these are deliberately approximate and overridable via env
 * vars rather than treated as a source of truth. Check your provider's current
 * pricing before a real run if the dollar amount matters to you.
 */

export interface PricePer1M {
  input: number
  output: number
}

const DEFAULT_PRICE_PER_1M: PricePer1M = { input: 3, output: 15 } // approx. mid-tier model pricing, USD

function currentPricing(): PricePer1M {
  const input = Number(process.env.SUTRA_PRICE_INPUT_PER_1M)
  const output = Number(process.env.SUTRA_PRICE_OUTPUT_PER_1M)
  return {
    input: Number.isFinite(input) && input > 0 ? input : DEFAULT_PRICE_PER_1M.input,
    output: Number.isFinite(output) && output > 0 ? output : DEFAULT_PRICE_PER_1M.output,
  }
}

/** Worst-case dollar ceiling if the run uses its entire token budget as output (the more expensive direction). */
export function estimateCeilingUsd(maxTokens: number): number {
  const price = currentPricing()
  return (maxTokens / 1_000_000) * price.output
}

/** What a completed run actually cost, from real token usage. */
export function actualCostUsd(inputTokens: number, outputTokens: number): number {
  const price = currentPricing()
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output
}

export function formatUsd(amount: number): string {
  return amount < 0.01 ? '<$0.01' : `~$${amount.toFixed(2)}`
}
