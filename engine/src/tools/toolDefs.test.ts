import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { ToolCall } from '../../../src/contracts/llm'
import { createFsTools } from './fs'
import { executeFsToolCall } from './toolDefs'

function withTempRoot(fn: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'sutra-tooldefs-'))
  writeFileSync(join(root, 'a.txt'), 'hello world')
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('executes a well-formed read_file call', () => {
  withTempRoot((root) => {
    const call: ToolCall = { id: 'c1', name: 'read_file', arguments: { path: 'a.txt' } }
    const result = executeFsToolCall(createFsTools(root), call)
    assert.equal(result.isError, false)
    assert.equal(result.content, 'hello world')
    assert.equal(result.toolCallId, 'c1')
  })
})

test('executes a well-formed edit_file call', () => {
  withTempRoot((root) => {
    const tools = createFsTools(root)
    const result = executeFsToolCall(tools, { id: 'c1', name: 'edit_file', arguments: { path: 'a.txt', oldString: 'world', newString: 'sutra' } })
    assert.equal(result.isError, false)
    assert.equal(tools.readFile('a.txt'), 'hello sutra')
  })
})

test('an unknown tool name is a recoverable error, not a throw', () => {
  withTempRoot((root) => {
    const result = executeFsToolCall(createFsTools(root), { id: 'c1', name: 'delete_everything', arguments: {} })
    assert.equal(result.isError, true)
    assert.match(result.content, /Unknown tool/)
  })
})

test('a missing required argument is a recoverable error, not a throw', () => {
  withTempRoot((root) => {
    // edit_file called without oldString/newString — a real model occasionally
    // does this; it must come back as a tool-result error the model can see
    // and correct, not crash the whole build loop.
    const result = executeFsToolCall(createFsTools(root), { id: 'c1', name: 'edit_file', arguments: { path: 'a.txt' } })
    assert.equal(result.isError, true)
    assert.match(result.content, /missing required string argument "oldString"/)
  })
})

test('a workspace-escaping path is a recoverable error, not a throw', () => {
  withTempRoot((root) => {
    const result = executeFsToolCall(createFsTools(root), { id: 'c1', name: 'read_file', arguments: { path: '../../etc/passwd' } })
    assert.equal(result.isError, true)
    assert.match(result.content, /escapes the workspace root/)
  })
})

test('an ambiguous edit_file match is a recoverable error naming the count', () => {
  withTempRoot((root) => {
    writeFileSync(join(root, 'b.txt'), 'foo foo')
    const result = executeFsToolCall(createFsTools(root), { id: 'c1', name: 'edit_file', arguments: { path: 'b.txt', oldString: 'foo', newString: 'bar' } })
    assert.equal(result.isError, true)
    assert.match(result.content, /matches 2 times/)
  })
})

test('list_dir with no path argument defaults to the workspace root', () => {
  withTempRoot((root) => {
    const result = executeFsToolCall(createFsTools(root), { id: 'c1', name: 'list_dir', arguments: {} })
    assert.equal(result.isError, false)
    assert.deepEqual(JSON.parse(result.content), [{ name: 'a.txt', type: 'file' }])
  })
})
