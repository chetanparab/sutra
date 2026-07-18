import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { resolveInWorkspace, WorkspaceEscapeError } from './workspace'

function withTempRoot(fn: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'sutra-ws-'))
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('resolves a relative path inside the workspace root', () => {
  withTempRoot((root) => {
    assert.equal(resolveInWorkspace(root, 'src/file.ts'), join(root, 'src', 'file.ts'))
  })
})

test('the workspace root itself is a valid target', () => {
  withTempRoot((root) => {
    assert.equal(resolveInWorkspace(root, '.'), root)
  })
})

test('rejects ../ traversal outside the workspace root', () => {
  withTempRoot((root) => {
    assert.throws(() => resolveInWorkspace(root, '../../../etc/passwd'), WorkspaceEscapeError)
  })
})

test('rejects a traversal path that dips out and back in', () => {
  withTempRoot((root) => {
    assert.throws(() => resolveInWorkspace(root, 'a/../../b'), WorkspaceEscapeError)
  })
})

test('rejects an absolute path outside the workspace root', () => {
  withTempRoot((root) => {
    assert.throws(() => resolveInWorkspace(root, '/etc/passwd'), WorkspaceEscapeError)
  })
})
