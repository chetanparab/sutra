/**
 * Tests the request/response translation against literal fixture JSON — no
 * live network call. This proves the adapter shapes bytes correctly; it
 * cannot and does not prove Anthropic's real API behaves as documented. A
 * live smoke test needs a real ANTHROPIC_API_KEY, which this suite
 * deliberately never touches.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ChatMessage, ToolDef } from '../../../src/contracts/llm'
import { createAnthropicProvider, fromAnthropicResponse, toAnthropicRequest } from './anthropic'

test('extracts system messages to the top-level field, not the messages array', () => {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are careful.' },
    { role: 'user', content: 'hi' },
  ]
  const req = toAnthropicRequest(messages, undefined, { model: 'claude-x' })
  assert.equal(req.system, 'You are careful.')
  assert.deepEqual(req.messages, [{ role: 'user', content: 'hi' }])
})

test('an assistant turn with tool calls becomes text + tool_use blocks', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: 'edit it' },
    {
      role: 'assistant',
      content: 'Let me read it first.',
      toolCalls: [{ id: 'call_1', name: 'read_file', arguments: { path: 'a.txt' } }],
    },
  ]
  const req = toAnthropicRequest(messages, undefined, { model: 'claude-x' })
  assert.deepEqual(req.messages[1], {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Let me read it first.' },
      { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'a.txt' } },
    ],
  })
})

test('consecutive tool-role messages merge into one user turn with multiple tool_result blocks', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: 'x' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'read_file', arguments: {} }, { id: 'c2', name: 'list_dir', arguments: {} }] },
    { role: 'tool', content: 'file contents', toolCallId: 'c1' },
    { role: 'tool', content: '[]', toolCallId: 'c2' },
  ]
  const req = toAnthropicRequest(messages, undefined, { model: 'claude-x' })
  const toolResultTurn = req.messages.at(-1)
  assert.equal(toolResultTurn?.role, 'user')
  assert.deepEqual(toolResultTurn?.content, [
    { type: 'tool_result', tool_use_id: 'c1', content: 'file contents' },
    { type: 'tool_result', tool_use_id: 'c2', content: '[]' },
  ])
})

test('tools translate name/description/parameters to name/description/input_schema', () => {
  const tools: ToolDef[] = [{ name: 'read_file', description: 'reads a file', parameters: { type: 'object', properties: {} } }]
  const req = toAnthropicRequest([{ role: 'user', content: 'x' }], tools, { model: 'claude-x' })
  assert.deepEqual(req.tools, [{ name: 'read_file', description: 'reads a file', input_schema: { type: 'object', properties: {} } }])
})

test('max_tokens defaults when not specified, and is required by the wire format', () => {
  const req = toAnthropicRequest([{ role: 'user', content: 'x' }], undefined, { model: 'claude-x' })
  assert.equal(typeof req.max_tokens, 'number')
  assert.ok(req.max_tokens > 0)
})

test('parses a text-only response', () => {
  const completion = fromAnthropicResponse({
    content: [{ type: 'text', text: 'All done.' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 120, output_tokens: 30 },
  })
  assert.equal(completion.text, 'All done.')
  assert.equal(completion.stopReason, 'stop')
  assert.equal(completion.toolCalls, undefined)
  assert.deepEqual(completion.usage, { inputTokens: 120, outputTokens: 30 })
})

test('parses a tool_use response into generic ToolCalls', () => {
  const completion = fromAnthropicResponse({
    content: [
      { type: 'text', text: 'Reading the file.' },
      { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'a.txt' } },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 50, output_tokens: 20 },
  })
  assert.equal(completion.stopReason, 'tool_use')
  assert.deepEqual(completion.toolCalls, [{ id: 'toolu_1', name: 'read_file', arguments: { path: 'a.txt' } }])
})

test('maps max_tokens stop_reason to the generic "length"', () => {
  const completion = fromAnthropicResponse({ content: [{ type: 'text', text: '...' }], stop_reason: 'max_tokens', usage: { input_tokens: 1, output_tokens: 1 } })
  assert.equal(completion.stopReason, 'length')
})

test('refuses to call the API without an API key, before any network attempt', async () => {
  const provider = createAnthropicProvider({ apiKey: undefined })
  const originalKey = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  try {
    await assert.rejects(
      provider.complete({ messages: [{ role: 'user', content: 'hi' }], opts: { model: 'claude-x' } }),
      /ANTHROPIC_API_KEY is not set/,
    )
  } finally {
    if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey
  }
})
