/**
 * The Phase 2 acceptance criterion (ROADMAP.md), proven end-to-end and
 * deterministically: a task a single pass can't solve (the scripted model's
 * first fix is subtly wrong) converges in 2 iterations — with REAL file
 * edits, REAL git commits, REAL verify-command executions (node actually
 * runs check.mjs, which actually fails and then actually passes), a real
 * reflect step, and the whole run recorded in the flight-recorder shapes the
 * web UI already renders. The model is scripted; nothing else is.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { makeTask2Fixture, TASK_2 } from '../../evals/tasks/task2FixAverage'
import { scriptedProvider, type ScriptedTurn } from '../testing/scriptedProvider'
import { runLoop } from './runLoop'

async function withTask2Repo(fn: (root: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'sutra-runloop-'))
  makeTask2Fixture(root)
  try {
    await fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// Iteration 1: a subtly WRONG fix (returns 1 for the empty case — check expects 0).
// Reflect: a memo pointing at the real failure. Iteration 2: the correct fix.
function twoIterationScript(): ScriptedTurn[] {
  return [
    // — iteration 1 Build —
    { text: '', toolCalls: [{ id: 'b1', name: 'read_file', arguments: { path: 'src/stats.mjs' } }] },
    {
      text: '',
      toolCalls: [
        {
          id: 'b2',
          name: 'edit_file',
          arguments: {
            path: 'src/stats.mjs',
            oldString: '  let total = 0',
            newString: '  if (nums.length === 0) return 1\n  let total = 0',
          },
        },
      ],
    },
    { text: 'Handled the empty case.' },
    // — Reflect after the real check.mjs failure —
    { text: '{"finding": "check.mjs still fails: average([]) returned 1 but the check expects 0.", "directive": "Change the empty-array guard in src/stats.mjs to return 0 instead of 1."}' },
    // — iteration 2 Build —
    { text: '', toolCalls: [{ id: 'b3', name: 'read_file', arguments: { path: 'src/stats.mjs' } }] },
    {
      text: '',
      toolCalls: [
        {
          id: 'b4',
          name: 'edit_file',
          arguments: { path: 'src/stats.mjs', oldString: 'if (nums.length === 0) return 1', newString: 'if (nums.length === 0) return 0' },
        },
      ],
    },
    { text: 'Corrected the guard to return 0.' },
  ]
}

test('a subtly-wrong first attempt converges in 2 iterations with real verify runs', async () => {
  await withTask2Repo(async (root) => {
    const provider = scriptedProvider(twoIterationScript())

    const outcome = await runLoop({
      workspacePath: root,
      intent: TASK_2.intent,
      provider,
      model: 'test',
      verifyCommand: TASK_2.verifyCommand,
      consentToRun: true,
      maxIterations: 3,
    })

    assert.equal(outcome.status, 'converged')
    if (outcome.status !== 'converged') return

    assert.equal(outcome.iterations, 2)
    // the final verify was a REAL execution of check.mjs that really passed
    assert.equal(outcome.finalVerify.passed, true)
    assert.match(outcome.finalVerify.stdout, /all cases passed/)
    // the file on disk really has the correct fix
    assert.match(readFileSync(join(root, TASK_2.targetFile), 'utf8'), /return 0/)
    // one real reflect memo, in the HermesMemo shape the UI renders
    assert.equal(outcome.memos.length, 1)
    assert.match(outcome.memos[0].finding, /average\(\[\]\) returned 1/)
    assert.equal(outcome.memos[0].routedTo, 'Build')
    // the flight recorder tells the full story in order
    const kinds = outcome.events.map((e) => e.kind)
    assert.deepEqual(kinds, ['iteration', 'verify', 'memo', 'iteration', 'verify', 'converge'])
    // both iterations were committed to the shadow branch
    const log = execFileSync('git', ['log', '--oneline'], { cwd: root, encoding: 'utf8' })
    assert.match(log, /\[iteration 1\]/)
    assert.match(log, /\[iteration 2\]/)
    // and the diff shows the net change
    assert.match(outcome.diff, /\+\s*if \(nums\.length === 0\) return 0/)
  })
})

test('exhausts the budget honestly when every fix is wrong, keeping failed commits', async () => {
  await withTask2Repo(async (root) => {
    const provider = scriptedProvider([
      // iteration 1: wrong fix
      { text: '', toolCalls: [{ id: 'b1', name: 'edit_file', arguments: { path: 'src/stats.mjs', oldString: '  let total = 0', newString: '  if (nums.length === 0) return 42\n  let total = 0' } }] },
      { text: 'Done (wrongly).' },
      // reflect
      { text: '{"finding": "still failing", "directive": "fix it properly"}' },
      // iteration 2: another wrong fix
      { text: '', toolCalls: [{ id: 'b2', name: 'edit_file', arguments: { path: 'src/stats.mjs', oldString: 'return 42', newString: 'return 7' } }] },
      { text: 'Done (still wrongly).' },
    ])

    const outcome = await runLoop({
      workspacePath: root,
      intent: TASK_2.intent,
      provider,
      model: 'test',
      verifyCommand: TASK_2.verifyCommand,
      consentToRun: true,
      maxIterations: 2,
    })

    assert.equal(outcome.status, 'exhausted')
    if (outcome.status !== 'exhausted') return
    assert.equal(outcome.iterations, 2)
    assert.equal(outcome.finalVerify.passed, false)
    assert.equal(outcome.events.at(-1)?.kind, 'exhausted')
    // failed iterations' commits are kept — failures carry information
    const log = execFileSync('git', ['log', '--oneline'], { cwd: root, encoding: 'utf8' })
    assert.match(log, /\[iteration 2\]/)
  })
})

test('a guardrail violation mid-iteration keeps completed iterations, discards partial work', async () => {
  await withTask2Repo(async (root) => {
    const alwaysCallsATool = () => ({ text: '', toolCalls: [{ id: 't', name: 'read_file', arguments: { path: 'src/stats.mjs' } }] })
    const provider = scriptedProvider([
      // iteration 1: wrong fix, committed
      { text: '', toolCalls: [{ id: 'b1', name: 'edit_file', arguments: { path: 'src/stats.mjs', oldString: '  let total = 0', newString: '  if (nums.length === 0) return 9\n  let total = 0' } }] },
      { text: 'Done.' },
      { text: '{"finding": "f", "directive": "d"}' },
      // iteration 2: burns turns until the guardrail trips
      ...Array.from({ length: 10 }, alwaysCallsATool),
    ])

    const outcome = await runLoop({
      workspacePath: root,
      intent: TASK_2.intent,
      provider,
      model: 'test',
      verifyCommand: TASK_2.verifyCommand,
      consentToRun: true,
      maxIterations: 3,
      guardrails: { maxTokens: 1_000_000, maxToolTurns: 4 },
    })

    assert.equal(outcome.status, 'guardrail-violation')
    if (outcome.status !== 'guardrail-violation') return
    assert.equal(outcome.iterationsCompleted, 1)
    // iteration 1's (wrong) committed edit survives; no partial iteration-2 work
    assert.match(readFileSync(join(root, 'src', 'stats.mjs'), 'utf8'), /return 9/)
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    assert.equal(status.trim(), '')
  })
})

test('the loop requires an existing repo', async () => {
  await assert.rejects(
    runLoop({
      workspacePath: '/tmp/definitely-not-a-repo-sutra-loop',
      intent: 'x',
      provider: scriptedProvider([]),
      model: 'x',
      verifyCommand: 'true',
      consentToRun: true,
    }),
    /requires an existing repo/,
  )
})
