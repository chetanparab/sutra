import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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

test('read/edit refuse to follow a symlink, even one that points inside the workspace', () => {
  // resolveInWorkspace's realpath check only rejects a symlink that ESCAPES the
  // root — a symlink pointing at another file *inside* the workspace would pass
  // that check. The O_NOFOLLOW protection in fs.ts is a separate, stricter
  // guarantee: it refuses to read or write through *any* symlink at the point
  // of actual I/O, closing the gap between a path check and the later use of
  // that path (a symlink could, in principle, be swapped in between the two).
  withTempRoot((root) => {
    writeFileSync(join(root, 'real.txt'), 'hello world')
    symlinkSync(join(root, 'real.txt'), join(root, 'link.txt'))
    const tools = createFsTools(root)
    assert.throws(() => tools.readFile('link.txt'))
    assert.throws(() => tools.editFile('link.txt', { oldString: 'world', newString: 'sutra' }))
    // and the real file was never touched via the symlink
    assert.equal(tools.readFile('real.txt'), 'hello world')
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
