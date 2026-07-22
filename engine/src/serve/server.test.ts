import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startServer } from './server'

const PORT = 4473 // an unlikely-taken high port for the test

test('serve: /health is open; mutating routes require the token', async () => {
  const srv = startServer({ port: PORT, token: 'test-token' })
  try {
    // health is open so the web app can detect a running engine
    const health = await fetch(`http://127.0.0.1:${PORT}/health`)
    assert.equal(health.status, 200)
    const body = (await health.json()) as { ok: boolean; engine: string }
    assert.equal(body.ok, true)
    assert.match(body.engine, /^\d+\.\d+\.\d+/)

    // /loop without a token is refused
    const noToken = await fetch(`http://127.0.0.1:${PORT}/loop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(noToken.status, 401)

    // wrong token is refused
    const badToken = await fetch(`http://127.0.0.1:${PORT}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sutra-Token': 'nope' }, body: '{}' })
    assert.equal(badToken.status, 401)

    // CORS preflight reflects the origin and allows the token header
    const preflight = await fetch(`http://127.0.0.1:${PORT}/loop`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5183' } })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5183')
    assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /X-Sutra-Token/i)
  } finally {
    await srv.close()
  }
})

test('serve: an unknown provider on /loop streams a clean error line, not a crash', async () => {
  const srv = startServer({ port: PORT + 1, token: 'test-token' })
  try {
    const res = await fetch(`http://127.0.0.1:${PORT + 1}/loop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sutra-Token': 'test-token' },
      body: JSON.stringify({ workspacePath: '/nonexistent-xyz', intent: 'x', provider: 'bogus', model: 'x' }),
    })
    assert.equal(res.status, 200) // the stream opens…
    const text = await res.text()
    // …and carries a single {type:"error"} line (no folder / unknown provider)
    assert.match(text, /"type":"error"/)
  } finally {
    await srv.close()
  }
})
