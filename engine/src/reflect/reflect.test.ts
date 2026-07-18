import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scriptedProvider } from '../testing/scriptedProvider'
import { extractMemoJson, reflect } from './reflect'

test('extracts a clean JSON memo', () => {
  const memo = extractMemoJson('{"finding": "empty array returns NaN", "directive": "guard the empty case"}')
  assert.deepEqual(memo, { finding: 'empty array returns NaN', directive: 'guard the empty case' })
})

test('extracts a memo wrapped in prose and code fences', () => {
  const memo = extractMemoJson('Here is the memo:\n```json\n{"finding": "f", "directive": "d"}\n```\nHope that helps!')
  assert.deepEqual(memo, { finding: 'f', directive: 'd' })
})

test('extracts a memo whose strings contain nested braces', () => {
  const memo = extractMemoJson('{"finding": "average({}) throws", "directive": "handle {} input"}')
  assert.deepEqual(memo, { finding: 'average({}) throws', directive: 'handle {} input' })
})

test('returns null for non-JSON and wrong-shaped JSON', () => {
  assert.equal(extractMemoJson('no json here at all'), null)
  assert.equal(extractMemoJson('{"unrelated": true}'), null)
})

test('reflect produces a memo from a scripted model response', async () => {
  const provider = scriptedProvider([
    { text: '{"finding": "check.mjs: average([]) returned NaN, expected 0", "directive": "add an empty-array guard returning 0 in src/stats.mjs"}' },
  ])
  const memo = await reflect({ provider, model: 'test', intent: 'fix average', iteration: 1, verifyOutputTail: 'AssertionError: NaN !== 0' })
  assert.match(memo.finding, /NaN/)
  assert.match(memo.directive, /empty-array guard/)
  assert.ok(memo.usage.inputTokens > 0)
})

test('reflect falls back gracefully when the model ignores the JSON format', async () => {
  const provider = scriptedProvider([{ text: 'The tests failed because of an off-by-one somewhere, probably.' }])
  const memo = await reflect({ provider, model: 'test', intent: 'x', iteration: 1, verifyOutputTail: 'fail' })
  assert.match(memo.finding, /off-by-one/)
  assert.ok(memo.directive.length > 0)
})

test('the verify output tail and intent both reach the model', async () => {
  const provider = scriptedProvider([{ text: '{"finding": "f", "directive": "d"}' }])
  await reflect({ provider, model: 'test', intent: 'THE-INTENT', iteration: 2, verifyOutputTail: 'THE-FAILURE-OUTPUT' })
  const sent = provider.callLog[0].messages.map((m) => m.content).join('\n')
  assert.match(sent, /THE-INTENT/)
  assert.match(sent, /THE-FAILURE-OUTPUT/)
  assert.match(sent, /Iteration 2/)
})
