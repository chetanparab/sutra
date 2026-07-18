/**
 * Issue #38: the adapters ride fetchWithRetry and classify context-limit
 * errors — proven here end-to-end through a real provider instance with an
 * injected fetch (retry-after: 0 keeps the retries instant).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAnthropicProvider } from './anthropic'
import { createOpenAiCompatProvider } from './openaiCompat'
import { ContextLimitError } from './retry'

const ANTHROPIC_OK = JSON.stringify({
  content: [{ type: 'text', text: 'recovered' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 5 },
})

const OPENAI_OK = JSON.stringify({
  choices: [{ message: { content: 'recovered' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
})

function scriptedFetch(responses: Response[]): typeof fetch {
  return async () => {
    const next = responses.shift()
    if (!next) throw new Error('scripted fetch ran out')
    return next
  }
}

const req = { messages: [{ role: 'user' as const, content: 'hi' }], opts: { model: 'test-model' } }

test('anthropic adapter survives a 529 overload and completes on the retry', async () => {
  const provider = createAnthropicProvider({
    apiKey: 'test-key',
    fetchImpl: scriptedFetch([
      new Response('overloaded', { status: 529, headers: { 'retry-after': '0' } }),
      new Response(ANTHROPIC_OK, { status: 200 }),
    ]),
  })
  const completion = await provider.complete(req)
  assert.equal(completion.text, 'recovered')
})

test('anthropic adapter turns a context-window 400 into a named, actionable error', async () => {
  const provider = createAnthropicProvider({
    apiKey: 'test-key',
    fetchImpl: scriptedFetch([new Response('{"error": {"message": "prompt is too long: 214881 tokens > 200000"}}', { status: 400 })]),
  })
  await assert.rejects(provider.complete(req), (err: unknown) => {
    assert.ok(err instanceof ContextLimitError)
    assert.match(err.message, /narrow the intent/)
    return true
  })
})

test('anthropic adapter still reports a plain 400 as a plain error', async () => {
  const provider = createAnthropicProvider({
    apiKey: 'test-key',
    fetchImpl: scriptedFetch([new Response('{"error": {"message": "model not found"}}', { status: 400 })]),
  })
  await assert.rejects(provider.complete(req), /Anthropic API error 400/)
})

test('openai-compat adapter survives a 429 and completes on the retry', async () => {
  const provider = createOpenAiCompatProvider({
    apiKey: 'test-key',
    fetchImpl: scriptedFetch([
      new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } }),
      new Response(OPENAI_OK, { status: 200 }),
    ]),
  })
  const completion = await provider.complete(req)
  assert.equal(completion.text, 'recovered')
})

test('openai-compat adapter classifies its context-length 400', async () => {
  const provider = createOpenAiCompatProvider({
    apiKey: 'test-key',
    fetchImpl: scriptedFetch([
      new Response("This model's maximum context length is 128000 tokens.", { status: 400 }),
    ]),
  })
  await assert.rejects(provider.complete(req), (err: unknown) => err instanceof ContextLimitError)
})
