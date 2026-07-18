/**
 * Phase 0 needs "a fake/echo LlmProvider so the plumbing can be exercised with
 * zero API cost" — but src/contracts/simulated.ts already has exactly that
 * (simulatedProvider). Reusing it here rather than writing a near-duplicate
 * proves the LlmProvider contract is callable from the engine's Node context,
 * with no new code needed until Phase 1's real adapters and tool-use loop.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { simulatedProvider } from '../../../src/contracts/simulated'

test('the contract-conformant fake provider is callable from the engine (Node) context', async () => {
  const result = await simulatedProvider.complete({
    messages: [{ role: 'user', content: 'hello from the engine' }],
    opts: { model: 'fake' },
  })
  assert.equal(result.stopReason, 'stop')
  assert.equal(simulatedProvider.id, 'simulated')
  assert.ok(result.text.length > 0)
})
