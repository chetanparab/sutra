import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { makeToyRepo } from '../../evals/fixtures/makeToyRepo'
import { scriptedProvider } from '../testing/scriptedProvider'
import { build, resolveProvider } from './build'

async function withToyRepo(fn: (root: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'sutra-build-'))
  makeToyRepo(root)
  try {
    await fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('requires an existing repo — does not self-bootstrap like apply-test-edit', async () => {
  await assert.rejects(
    build({ workspacePath: '/tmp/definitely-does-not-exist-sutra-build-test', intent: 'x', providerId: 'anthropic', model: 'x' }),
    /requires an existing repo/,
  )
})

test('rejects an unknown provider id', () => {
  assert.throws(() => resolveProvider('made-up-provider'), /Unknown provider/)
})

test('converges: real edit applied, committed to a shadow branch, reviewable diff', async () => {
  await withToyRepo(async (root) => {
    const provider = scriptedProvider([
      { text: '', toolCalls: [{ id: 't1', name: 'read_file', arguments: { path: 'src/greet.ts' } }] },
      { text: '', toolCalls: [{ id: 't2', name: 'edit_file', arguments: { path: 'src/greet.ts', oldString: '// TODO: implement', newString: '// implemented' } }] },
      { text: 'Done.', usage: { inputTokens: 10, outputTokens: 5 } },
    ])

    const outcome = await build({ workspacePath: root, intent: 'implement greet', providerId: 'anthropic', model: 'x', provider })

    assert.equal(outcome.status, 'converged')
    if (outcome.status !== 'converged') return
    assert.match(outcome.diff, /-\s*\/\/ TODO: implement/)
    assert.match(outcome.diff, /\+\s*\/\/ implemented/)
    assert.equal(readFileSync(join(root, 'src', 'greet.ts'), 'utf8').includes('// implemented'), true)
    assert.ok(outcome.actualCostUsd >= 0)
  })
})

test('a tripped guardrail leaves no partial edit on disk', async () => {
  await withToyRepo(async (root) => {
    const alwaysCallsATool = () => ({ text: '', toolCalls: [{ id: 't', name: 'read_file', arguments: { path: 'src/greet.ts' } }] })
    const provider = scriptedProvider(Array.from({ length: 20 }, alwaysCallsATool))

    const outcome = await build({
      workspacePath: root,
      intent: 'x',
      providerId: 'anthropic',
      model: 'x',
      provider,
      guardrails: { maxTokens: 1_000_000, maxToolTurns: 2 },
    })

    assert.equal(outcome.status, 'guardrail-violation')
    // the fixture's original content is untouched — nothing was left applied
    assert.match(readFileSync(join(root, 'src', 'greet.ts'), 'utf8'), /TODO: implement/)
  })
})

test('an abort leaves no partial edit on disk', async () => {
  await withToyRepo(async (root) => {
    const provider = scriptedProvider([
      { text: '', toolCalls: [{ id: 't1', name: 'edit_file', arguments: { path: 'src/greet.ts', oldString: '// TODO: implement', newString: '// partially done' } }] },
      { text: 'Continuing…', toolCalls: [{ id: 't2', name: 'read_file', arguments: { path: 'src/greet.ts' } }] },
      { text: 'Done.' },
    ])
    const controller = new AbortController()

    // Abort after the first tool call has actually been applied to disk, but
    // before the run finishes — proving the *disk* is cleaned up even though a
    // real edit_file call already happened mid-loop.
    const originalComplete = provider.complete.bind(provider)
    let calls = 0
    provider.complete = async (req) => {
      calls += 1
      if (calls === 2) controller.abort()
      return originalComplete(req)
    }

    const outcome = await build({ workspacePath: root, intent: 'x', providerId: 'anthropic', model: 'x', provider, signal: controller.signal })

    assert.equal(outcome.status, 'aborted')
    assert.match(readFileSync(join(root, 'src', 'greet.ts'), 'utf8'), /TODO: implement/)
  })
})
