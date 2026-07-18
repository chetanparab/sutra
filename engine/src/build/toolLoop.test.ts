import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createFsTools } from '../tools/fs'
import { scriptedProvider } from '../testing/scriptedProvider'
import { GuardrailViolation } from './guardrails'
import { runBuildLoop } from './toolLoop'
import { connectMcpServers } from '../mcp/client'
import { fileURLToPath } from 'node:url'

const FAKE_MCP_SERVER = fileURLToPath(new URL('../mcp/fakeServer.mjs', import.meta.url))

// runBuildLoop is async, unlike Phase 0's fs/git ops — this helper must await
// `fn` before cleaning up, or the temp dir gets deleted while the loop is
// still mid-flight (a real bug this file hit on the first pass: rmSync ran
// before the async test body had actually finished).
async function withTempWorkspace(fn: (root: string) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'sutra-loop-'))
  writeFileSync(join(root, 'a.txt'), 'hello world')
  try {
    await fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('a single turn with no tool calls returns immediately', async () => {
  await withTempWorkspace(async (root) => {
    const provider = scriptedProvider([{ text: 'Nothing to do here.' }])
    const result = await runBuildLoop({ provider, model: 'test', intent: 'do nothing', tools: createFsTools(root) })
    assert.equal(result.turns, 1)
    assert.equal(result.finalText, 'Nothing to do here.')
    assert.deepEqual(result.toolCallLog, [])
  })
})

test('drives a real multi-turn tool-use conversation: read, then edit, then stop', async () => {
  await withTempWorkspace(async (root) => {
    const provider = scriptedProvider([
      { text: '', toolCalls: [{ id: 't1', name: 'read_file', arguments: { path: 'a.txt' } }] },
      { text: '', toolCalls: [{ id: 't2', name: 'edit_file', arguments: { path: 'a.txt', oldString: 'world', newString: 'sutra' } }] },
      { text: 'Done — replaced "world" with "sutra".' },
    ])

    const result = await runBuildLoop({ provider, model: 'test', intent: 'change world to sutra', tools: createFsTools(root) })

    assert.equal(result.turns, 3)
    assert.equal(result.finalText, 'Done — replaced "world" with "sutra".')
    assert.equal(createFsTools(root).readFile('a.txt'), 'hello sutra')
    assert.deepEqual(
      result.toolCallLog.map((e) => e.name),
      ['read_file', 'edit_file'],
    )
    assert.ok(result.toolCallLog.every((e) => !e.isError))
  })
})

test('a failed tool call (ambiguous match) is fed back as an error, not a crash', async () => {
  await withTempWorkspace(async (root) => {
    writeFileSync(join(root, 'b.txt'), 'foo foo')
    const provider = scriptedProvider([
      { text: '', toolCalls: [{ id: 't1', name: 'edit_file', arguments: { path: 'b.txt', oldString: 'foo', newString: 'bar' } }] },
      { text: 'Retrying with more context.', toolCalls: [{ id: 't2', name: 'edit_file', arguments: { path: 'b.txt', oldString: 'foo foo', newString: 'bar foo' } }] },
      { text: 'Fixed.' },
    ])

    const result = await runBuildLoop({ provider, model: 'test', intent: 'fix it', tools: createFsTools(root) })

    assert.equal(result.toolCallLog[0].isError, true)
    assert.equal(result.toolCallLog[1].isError, false)
    // the second call's tool-result content was fed back into the conversation
    const secondRequest = provider.callLog[2]
    const lastMessage = secondRequest.messages.at(-1)
    assert.equal(lastMessage?.role, 'tool')
  })
})

test('trips the max-tool-turns guardrail rather than looping forever', async () => {
  await withTempWorkspace(async (root) => {
    const alwaysCallsATool = () => ({ text: '', toolCalls: [{ id: 't', name: 'read_file', arguments: { path: 'a.txt' } }] })
    const provider = scriptedProvider(Array.from({ length: 20 }, alwaysCallsATool))

    await assert.rejects(
      runBuildLoop({ provider, model: 'test', intent: 'loop forever', tools: createFsTools(root), guardrails: { maxTokens: 1_000_000, maxToolTurns: 3 } }),
      (err: unknown) => err instanceof GuardrailViolation && err.kind === 'max-turns',
    )
  })
})

test('trips the max-tokens guardrail', async () => {
  await withTempWorkspace(async (root) => {
    const provider = scriptedProvider([{ text: 'huge turn', usage: { inputTokens: 900, outputTokens: 900 } }])

    await assert.rejects(
      runBuildLoop({ provider, model: 'test', intent: 'x', tools: createFsTools(root), guardrails: { maxTokens: 1000, maxToolTurns: 10 } }),
      (err: unknown) => err instanceof GuardrailViolation && err.kind === 'max-tokens',
    )
  })
})

test('an already-aborted signal stops the loop before any call is made', async () => {
  await withTempWorkspace(async (root) => {
    const provider = scriptedProvider([{ text: 'should never be reached' }])
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      runBuildLoop({ provider, model: 'test', intent: 'x', tools: createFsTools(root), signal: controller.signal }),
      /AbortError|aborted/i,
    )
    assert.equal(provider.callLog.length, 0)
  })
})

test('malformed tool calls (unknown tool, missing args) are fed back as errors the model can correct', async () => {
  await withTempWorkspace(async (root) => {
    writeFileSync(join(root, 'c.txt'), 'hello')
    const provider = scriptedProvider([
      // turn 1: an unknown tool AND an edit_file with missing arguments
      {
        text: '',
        toolCalls: [
          { id: 'm1', name: 'run_shell', arguments: { cmd: 'rm -rf /' } },
          { id: 'm2', name: 'edit_file', arguments: { path: 'c.txt' } },
        ],
      },
      // turn 2: the model reads the errors and does it properly
      { text: '', toolCalls: [{ id: 'm3', name: 'edit_file', arguments: { path: 'c.txt', oldString: 'hello', newString: 'hello world' } }] },
      { text: 'Corrected.' },
    ])

    const result = await runBuildLoop({ provider, model: 'test', intent: 'x', tools: createFsTools(root) })

    assert.equal(result.toolCallLog[0].isError, true)
    assert.equal(result.toolCallLog[1].isError, true)
    assert.equal(result.toolCallLog[2].isError, false)
    // the unknown tool was refused by name, and nothing was executed for it
    const turn2 = provider.callLog[1]
    const toolResults = turn2.messages.filter((m) => m.role === 'tool')
    assert.match(toolResults[0].content, /Unknown tool: "run_shell"/)
    assert.match(toolResults[1].content, /missing required string argument "oldString"/)
    // and the real edit landed on disk in the end
    assert.match(createFsTools(root).readFile('c.txt'), /hello world/)
  })
})

test('the model can call an MCP tool alongside the fs tools (issue #9)', async () => {
  await withTempWorkspace(async (root) => {
    writeFileSync(join(root, 'note.txt'), 'start')
    const set = await connectMcpServers([{ command: process.execPath, args: [FAKE_MCP_SERVER] }])
    try {
      // The scripted model: call the MCP add tool, then finish. Proves MCP
      // tools are offered and routed.
      const provider = scriptedProvider([
        { text: '', toolCalls: [{ id: 'm1', name: 'mcp__add', arguments: { a: 20, b: 22 } }] },
        { text: 'The sum is 42.' },
      ])

      const result = await runBuildLoop({
        provider,
        model: 'test',
        intent: 'use the mcp tool',
        tools: createFsTools(root),
        extraTools: set.tools,
        dispatchExtraTool: (call) => set.callTool(call.name, call.arguments),
      })

      // the mcp tool was offered to the model…
      const offered = provider.callLog[0].tools?.map((t) => t.name) ?? []
      assert.ok(offered.includes('mcp__add'))
      assert.ok(offered.includes('read_file')) // fs tools still there too
      // …and its result was routed back
      assert.equal(result.toolCallLog[0].name, 'mcp__add')
      assert.equal(result.toolCallLog[0].isError, false)
      const toolMsg = provider.callLog[1].messages.find((m) => m.role === 'tool')
      assert.ok(toolMsg)
      assert.equal(toolMsg.content, '42')
    } finally {
      set.close()
    }
  })
})
