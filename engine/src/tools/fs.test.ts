import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createFsTools, EditMatchError, READ_FILE_MAX_CHARS } from './fs'
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

test('creates a new file, making parent directories as needed', () => {
  withTempRoot((root) => {
    const tools = createFsTools(root)
    tools.createFile('src/lib/util.ts', 'export const x = 1\n')
    assert.equal(tools.readFile('src/lib/util.ts'), 'export const x = 1\n')
  })
})

test('create_file refuses to clobber an existing file (that is edit_file’s job)', () => {
  withTempRoot((root) => {
    writeFileSync(join(root, 'a.txt'), 'original')
    const tools = createFsTools(root)
    assert.throws(() => tools.createFile('a.txt', 'replacement'), /already exists/)
    assert.equal(tools.readFile('a.txt'), 'original')
  })
})

test('create_file cannot escape the workspace root', () => {
  withTempRoot((root) => {
    assert.throws(() => createFsTools(root).createFile('../evil.txt', 'x'), WorkspaceEscapeError)
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

test('a huge file is truncated with an explicit marker; small files come back whole', () => {
  withTempRoot((root) => {
    const tools = createFsTools(root)
    writeFileSync(join(root, 'huge.txt'), 'x'.repeat(READ_FILE_MAX_CHARS + 5000))
    const result = tools.readFile('huge.txt')
    assert.ok(result.length < READ_FILE_MAX_CHARS + 500)
    assert.match(result, /truncated by the engine/)
    assert.match(result, /the first 48000 are shown/)

    writeFileSync(join(root, 'small.txt'), 'tiny content')
    assert.equal(tools.readFile('small.txt'), 'tiny content')
  })
})

test('editing text beyond the truncation point still works — matching runs on the full file', () => {
  withTempRoot((root) => {
    const tools = createFsTools(root)
    const content = 'x'.repeat(READ_FILE_MAX_CHARS) + '\nconst hidden = "beyond the fold"\n'
    writeFileSync(join(root, 'huge.txt'), content)
    tools.editFile('huge.txt', { oldString: 'beyond the fold', newString: 'still editable' })
    assert.match(tools.readFile('huge.txt'), /truncated by the engine/) // read is capped…
    // …but the write really landed (check raw content via a fresh read of the tail)
    assert.doesNotThrow(() => tools.editFile('huge.txt', { oldString: 'still editable', newString: 'ok' }))
  })
})

test('a whitespace-drift edit miss quotes the file\'s exact nearest region', () => {
  withTempRoot((root) => {
    const tools = createFsTools(root)
    writeFileSync(join(root, 'code.ts'), 'function greet() {\n    return "hi"  // four-space indent\n}\n')
    // a tab-indented attempt at the space-indented line: zero exact matches, hint shows the real bytes
    try {
      tools.editFile('code.ts', { oldString: '\treturn "hi"  // four-space indent', newString: 'x' })
      assert.fail('should have thrown')
    } catch (err) {
      assert.ok(err instanceof EditMatchError)
      assert.match(err.message, /nearest matching region actually reads/)
      assert.match(err.message, /four-space indent/)
      assert.match(err.message, /whitespace shown exactly/)
    }
  })
})

test('an edit miss with no nearby region still gives the plain retry guidance', () => {
  withTempRoot((root) => {
    const tools = createFsTools(root)
    writeFileSync(join(root, 'a.txt'), 'completely unrelated content\n')
    try {
      tools.editFile('a.txt', { oldString: 'nothing like this exists', newString: 'x' })
      assert.fail('should have thrown')
    } catch (err) {
      assert.ok(err instanceof EditMatchError)
      assert.match(err.message, /No exact match/)
      assert.match(err.message, /retry with its exact current text/)
      assert.doesNotMatch(err.message, /nearest matching region/)
    }
  })
})
