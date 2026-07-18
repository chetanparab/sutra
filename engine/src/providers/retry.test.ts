import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ContextLimitError, fetchWithRetry, isRetryableStatus, looksLikeContextLimit, retryAfterMs } from './retry'

const ok = () => new Response('{"fine": true}', { status: 200 })
const status = (code: number, headers?: Record<string, string>) => new Response('err', { status: code, headers })

/** A scripted fetch: pops one behavior per call; 'network' throws like a dead socket. */
function scriptedFetch(script: (Response | 'network')[]): { impl: typeof fetch; calls: number } {
  const state = { calls: 0 }
  const impl: typeof fetch = async () => {
    state.calls++
    const next = script.shift()
    if (!next) throw new Error('scripted fetch ran out of turns')
    if (next === 'network') throw new TypeError('fetch failed: socket hang up')
    return next
  }
  return { impl, get calls() { return state.calls } }
}

const instantSleep = { slept: [] as number[] }
const sleepSpy = async (ms: number) => {
  instantSleep.slept.push(ms)
}

test('retryable statuses: 408, 429, 5xx yes; 400/401/404 no', () => {
  for (const s of [408, 429, 500, 502, 503, 529]) assert.equal(isRetryableStatus(s), true, String(s))
  for (const s of [200, 400, 401, 403, 404, 422]) assert.equal(isRetryableStatus(s), false, String(s))
})

test('a 429 then a 200 succeeds on the retry', async () => {
  const fake = scriptedFetch([status(429), ok()])
  const res = await fetchWithRetry('https://x', {}, { fetchImpl: fake.impl, sleepImpl: sleepSpy })
  assert.equal(res.status, 200)
  assert.equal(fake.calls, 2)
})

test('a network failure then a 200 succeeds on the retry', async () => {
  const fake = scriptedFetch(['network', ok()])
  const res = await fetchWithRetry('https://x', {}, { fetchImpl: fake.impl, sleepImpl: sleepSpy })
  assert.equal(res.status, 200)
  assert.equal(fake.calls, 2)
})

test('Retry-After in seconds overrides the backoff delay', async () => {
  instantSleep.slept.length = 0
  const fake = scriptedFetch([status(429, { 'retry-after': '2' }), ok()])
  await fetchWithRetry('https://x', {}, { fetchImpl: fake.impl, sleepImpl: sleepSpy })
  assert.deepEqual(instantSleep.slept, [2000])
})

test('gives up after maxAttempts and returns the last retryable response', async () => {
  const fake = scriptedFetch([status(503), status(503), status(503)])
  const res = await fetchWithRetry('https://x', {}, { maxAttempts: 3, fetchImpl: fake.impl, sleepImpl: sleepSpy })
  assert.equal(res.status, 503)
  assert.equal(fake.calls, 3)
})

test('a non-retryable status returns immediately, no retries burned', async () => {
  const fake = scriptedFetch([status(400)])
  const res = await fetchWithRetry('https://x', {}, { fetchImpl: fake.impl, sleepImpl: sleepSpy })
  assert.equal(res.status, 400)
  assert.equal(fake.calls, 1)
})

test('persistent network failure rethrows the last error after maxAttempts', async () => {
  const fake = scriptedFetch(['network', 'network'])
  await assert.rejects(
    fetchWithRetry('https://x', {}, { maxAttempts: 2, fetchImpl: fake.impl, sleepImpl: sleepSpy }),
    /socket hang up/,
  )
  assert.equal(fake.calls, 2)
})

test('abort is never retried — it rethrows instantly', async () => {
  const controller = new AbortController()
  const impl: typeof fetch = async () => {
    controller.abort()
    throw new DOMException('aborted', 'AbortError')
  }
  await assert.rejects(fetchWithRetry('https://x', {}, { fetchImpl: impl, signal: controller.signal }), (err: unknown) => {
    return err instanceof DOMException && err.name === 'AbortError'
  })
})

test('retryAfterMs parses seconds, dates, and garbage', () => {
  assert.equal(retryAfterMs('3'), 3000)
  assert.equal(retryAfterMs(null), null)
  assert.equal(retryAfterMs('not-a-thing'), null)
  const inTwoSec = retryAfterMs(new Date(Date.now() + 2000).toUTCString())
  assert.ok(inTwoSec !== null && inTwoSec >= 0 && inTwoSec <= 2500)
})

test('context-limit detection matches provider wordings on 400 only', () => {
  assert.equal(looksLikeContextLimit(400, '{"error": "prompt is too long: 210000 tokens"}'), true)
  assert.equal(looksLikeContextLimit(400, 'maximum context length is 200000 tokens'), true)
  assert.equal(looksLikeContextLimit(400, 'invalid model id'), false)
  assert.equal(looksLikeContextLimit(500, 'context length exceeded'), false)
  const err = new ContextLimitError('anthropic', 'prompt is too long')
  assert.match(err.message, /narrow the intent/)
})
