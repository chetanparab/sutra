import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createFsTools, EditMatchError } from './fs'
import { WorkspaceEscapeError } from './workspace'

function withTempRoot(fn: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'sutra-fs-'))
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('reads a file', () => {
  withTempRoot((root) => {
    writeFileSync(join(root, 'a.txt'), 'hello world')
    assert.equal(createFsTools(root).readFile('a.txt'), 'hello world')
  })
})

test('edits a file with a unique match', () => {
  withTempRoot((root) => {
    writeFileSync(join(root, 'a.txt'), 'hello world')
    const tools = createFsTools(root)
    tools.editFile('a.txt', { oldString: 'world', newString: 'sutra' })
    assert.equal(tools.readFile('a.txt'), 'hello sutra')
  })
})

test('lists directory entries with file/dir type', () => {
  withTempRoot((root) => {
    writeFileSync(join(root, 'a.txt'), 'x')
    mkdirSync(join(root, 'sub'))
    const entries = createFsTools(root).listDir().sort((a, b) => a.name.localeCompare(b.name))
    assert.deepEqual(entries, [
      { name: 'a.txt', type: 'file' },
      { name: 'sub', type: 'dir' },
    ])
  })
})

test('rejects an edit whose oldString has no match', () => {
  withTempRoot((root) => {
    writeFileSync(join(root, 'a.txt'), 'hello world')
    assert.throws(() => createFsTools(root).editFile('a.txt', { oldString: 'nope', newString: 'x' }), EditMatchError)
  })
})

test('rejects an edit whose oldString matches more than once', () => {
  withTempRoot((root) => {
    writeFileSync(join(root, 'a.txt'), 'foo foo')
    assert.throws(() => createFsTools(root).editFile('a.txt', { oldString: 'foo', newString: 'bar' }), EditMatchError)
  })
})

test('every tool call outside the workspace root is rejected', () => {
  withTempRoot((root) => {
    const tools = createFsTools(root)
    assert.throws(() => tools.readFile('../../etc/passwd'), WorkspaceEscapeError)
    assert.throws(() => tools.listDir('../../etc'), WorkspaceEscapeError)
    assert.throws(() => tools.editFile('../../etc/passwd', { oldString: 'x', newString: 'y' }), WorkspaceEscapeError)
  })
})
