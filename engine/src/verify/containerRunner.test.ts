/**
 * These tests run REAL Docker containers when a daemon is available, and SKIP
 * cleanly when it isn't (CI without Docker, a dev box with it stopped) — the
 * same pattern as the Rust sidecar handshake test. The consent guard is
 * checked unconditionally; it needs no daemon.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { isDockerAvailable, runVerifyInContainer } from './containerRunner'

const DOCKER = isDockerAvailable()
const skip = DOCKER ? false : 'Docker not available — skipping real-container tests'

function withTempRoot(fn: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'sutra-container-'))
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('refuses without literal consent — no daemon needed', () => {
  withTempRoot((root) => {
    assert.throws(
      () => runVerifyInContainer({ workspaceRoot: root, command: 'true', consentToRun: false as unknown as true }),
      /consentToRun must be explicitly true/,
    )
  })
})

test('a passing command in a container reports passed', { skip }, () => {
  withTempRoot((root) => {
    const result = runVerifyInContainer({ workspaceRoot: root, command: 'true', consentToRun: true, image: 'alpine:latest' })
    assert.equal(result.passed, true)
    assert.equal(result.exitCode, 0)
  })
})

test('a failing command in a container reports its real exit code', { skip }, () => {
  withTempRoot((root) => {
    const result = runVerifyInContainer({ workspaceRoot: root, command: 'echo boom >&2; exit 3', consentToRun: true, image: 'alpine:latest' })
    assert.equal(result.passed, false)
    assert.equal(result.exitCode, 3)
    assert.match(result.stderr, /boom/)
  })
})

test('the workspace is mounted at /work — the repo files are really there', { skip }, () => {
  withTempRoot((root) => {
    writeFileSync(join(root, 'marker.txt'), 'hello from host')
    const result = runVerifyInContainer({ workspaceRoot: root, command: 'cat marker.txt', consentToRun: true, image: 'alpine:latest' })
    assert.equal(result.passed, true)
    assert.match(result.stdout, /hello from host/)
  })
})

test('the network is off by default — the command cannot reach out', { skip }, () => {
  withTempRoot((root) => {
    // With --network none, resolving/reaching a host fails. `wget` (busybox)
    // returns non-zero; we assert the command did NOT succeed.
    const result = runVerifyInContainer({
      workspaceRoot: root,
      command: 'wget -T 3 -q -O- http://example.com >/dev/null 2>&1 && echo REACHED || echo BLOCKED',
      consentToRun: true,
      image: 'alpine:latest',
    })
    assert.match(result.stdout, /BLOCKED/)
    assert.doesNotMatch(result.stdout, /REACHED/)
  })
})

test('a verify run really executes the repo test inside the container', { skip }, () => {
  withTempRoot((root) => {
    writeFileSync(join(root, 'check.sh'), 'grep -q ok status.txt && echo passed || { echo failed; exit 1; }\n')
    writeFileSync(join(root, 'status.txt'), 'ok\n')
    const result = runVerifyInContainer({ workspaceRoot: root, command: 'sh check.sh', consentToRun: true, image: 'alpine:latest' })
    assert.equal(result.passed, true)
    assert.match(result.stdout, /passed/)
  })
})
