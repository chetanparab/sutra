/**
 * These tests execute real commands via the real runner — that's the point of
 * Phase 2 (real verification, not simulated). The commands themselves are
 * trivial node one-liners, so the suite stays fast and dependency-free.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { outputTailForMemo, runVerifyCommand } from './runner'

function withTempRoot(fn: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'sutra-verify-'))
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('a passing command reports passed with exit code 0', () => {
  withTempRoot((root) => {
    const result = runVerifyCommand({ workspaceRoot: root, command: 'node -e "process.exit(0)"', consentToRun: true })
    assert.equal(result.passed, true)
    assert.equal(result.exitCode, 0)
    assert.equal(result.timedOut, false)
  })
})

test('a failing command reports failed with its real exit code and output', () => {
  withTempRoot((root) => {
    const result = runVerifyCommand({
      workspaceRoot: root,
      command: 'node -e "console.error(\'2 tests failed\'); process.exit(1)"',
      consentToRun: true,
    })
    assert.equal(result.passed, false)
    assert.equal(result.exitCode, 1)
    assert.match(result.stderr, /2 tests failed/)
  })
})

test('runs in the workspace root — a repo-local script is reachable by relative path', () => {
  withTempRoot((root) => {
    writeFileSync(join(root, 'check.mjs'), 'console.log("checked in cwd"); process.exit(0)\n')
    const result = runVerifyCommand({ workspaceRoot: root, command: 'node check.mjs', consentToRun: true })
    assert.equal(result.passed, true)
    assert.match(result.stdout, /checked in cwd/)
  })
})

test('a hung command times out and reports failed, not passed', () => {
  withTempRoot((root) => {
    const result = runVerifyCommand({
      workspaceRoot: root,
      command: 'node -e "setTimeout(() => {}, 60000)"',
      consentToRun: true,
      timeoutMs: 500,
    })
    assert.equal(result.timedOut, true)
    assert.equal(result.passed, false)
  })
})

test('refuses to run without literal consent at runtime (untyped call path)', () => {
  withTempRoot((root) => {
    assert.throws(
      () =>
        runVerifyCommand({
          workspaceRoot: root,
          command: 'node -e "process.exit(0)"',
          // simulating an untyped/JSON caller that didn't set consent
          consentToRun: false as unknown as true,
        }),
      /consentToRun must be explicitly true/,
    )
  })
})

test('an unknown command is a failed verify (shells report it via exit 127, not a spawn error)', () => {
  withTempRoot((root) => {
    const result = runVerifyCommand({ workspaceRoot: root, command: 'definitely-not-a-real-command-xyz', consentToRun: true })
    assert.equal(result.passed, false)
    assert.notEqual(result.exitCode, 0)
  })
})

test('outputTailForMemo keeps short output whole and truncates long output from the front', () => {
  const short = outputTailForMemo({ passed: false, exitCode: 1, termSignal: null, stdout: 'brief', stderr: '', durationMs: 1, timedOut: false })
  assert.equal(short, 'brief')

  const long = outputTailForMemo(
    { passed: false, exitCode: 1, termSignal: null, stdout: 'x'.repeat(10_000), stderr: 'THE-END-MATTERS', durationMs: 1, timedOut: false },
    100,
  )
  assert.match(long, /^…\(truncated\)…/)
  assert.match(long, /THE-END-MATTERS$/)
  assert.ok(long.length < 200)
})
