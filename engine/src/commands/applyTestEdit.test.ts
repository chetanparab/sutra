/**
 * The Phase 0 acceptance criterion from ROADMAP.md, proven end-to-end:
 * "npm run engine -- apply-test-edit <path> deterministically edits a file,
 * commits it to a shadow branch, and can be rolled back."
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { rollbackTo } from '../git/shadowBranch'
import { applyTestEdit } from './applyTestEdit'

function withTempParent(fn: (parent: string) => void) {
  const parent = mkdtempSync(join(tmpdir(), 'sutra-cli-'))
  try {
    fn(parent)
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
}

test('self-bootstraps the toy fixture when the target path does not exist', () => {
  withTempParent((parent) => {
    const target = join(parent, 'toy-repo')
    const result = applyTestEdit(target)
    assert.equal(result.bootstrapped, true)
    assert.match(readFileSync(join(target, 'src', 'greet.ts'), 'utf8'), /Phase 0 test edit/)
  })
})

test('deterministically edits, commits to a shadow branch, and the commit is real', () => {
  withTempParent((parent) => {
    const target = join(parent, 'toy-repo')
    const result = applyTestEdit(target)
    assert.match(result.commitSha, /^[0-9a-f]{40}$/)
    assert.notEqual(result.commitSha, result.baseRef)
    assert.match(result.diff, /-\s*\/\/ TODO: implement/)
    assert.match(result.diff, /\+\s*\/\/ implemented by sutra-engine/)
  })
})

test('the applied edit can be rolled back', () => {
  withTempParent((parent) => {
    const target = join(parent, 'toy-repo')
    const result = applyTestEdit(target)
    rollbackTo(result.workspaceRoot, result.baseRef)
    assert.match(readFileSync(join(target, 'src', 'greet.ts'), 'utf8'), /TODO: implement/)
  })
})

test('does not bootstrap when a repo already exists at the target', () => {
  withTempParent((parent) => {
    const target = join(parent, 'toy-repo')
    applyTestEdit(target) // first run creates it
    const second = applyTestEdit(target) // second run reuses it
    assert.equal(second.bootstrapped, false)
  })
})
