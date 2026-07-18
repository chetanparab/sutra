/**
 * Tests the request/response translation against literal fixture JSON — no
 * live network call. See anthropic.test.ts for why.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ChatMessage, ToolDef } from '../../../src/contracts/llm'
import { createOpenAiCompatProvider, fromOpenAiResponse, toOpenAiRequest } from './openaiCompat'

test('system and tool roles map straight through, unlike Anthropic', () => {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'Be careful.' },
    { role: 'user', content: 'hi' },
    { role: 'tool', content: 'result', toolCallId: 'c1' },
  ]
  const req = toOpenAiRequest(messages, undefined, { model: 'gpt-x' })
  assert.deepEqual(req.messages, [
    { role: 'system', content: 'Be careful.' },
    { role: 'user', content: 'hi' },
    { role: 'tool', content: 'result', tool_call_id: 'c1' },
  ])
})

test('an assistant turn with tool calls JSON-stringifies the arguments', () => {
  const messages: ChatMessage[] = [{ role: 'assistant', content: 'reading', toolCalls: [{ id: 'c1', name: 'read_file', arguments: { path: 'a.txt' } }] }]
  const req = toOpenAiRequest(messages, undefined, { model: 'gpt-x' })
  assert.deepEqual(req.messages[0].tool_calls, [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } }])
})

test('tools translate to the {type: function, function: {...}} wrapper', () => {
  const tools: ToolDef[] = [{ name: 'read_file', description: 'reads a file', parameters: { type: 'object', properties: {} } }]
  const req = toOpenAiRequest([{ role: 'user', content: 'x' }], tools, { model: 'gpt-x' })
  assert.deepEqual(req.tools, [{ type: 'function', function: { name: 'read_file', description: 'reads a file', parameters: { type: 'object', properties: {} } } }])
})

test('parses a text-only response', () => {
  const completion = fromOpenAiResponse({
    choices: [{ message: { role: 'assistant', content: 'All done.' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  })
  assert.equal(completion.text, 'All done.')
  assert.equal(completion.stopReason, 'stop')
  assert.deepEqual(completion.usage, { inputTokens: 100, outputTokens: 20 })
})

test('parses a tool_calls response, JSON-parsing the arguments string back to an object', () => {
  const completion = fromOpenAiResponse({
    choices: [
      {
        message: { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } }] },
        finish_reason: 'tool_calls',
      },
    ],
  })
  assert.equal(completion.stopReason, 'tool_use')
  assert.deepEqual(completion.toolCalls, [{ id: 'call_1', name: 'read_file', arguments: { path: 'a.txt' } }])
})

test('throws a clear error on malformed tool-call-arguments JSON rather than silently misreading it', () => {
  assert.throws(
    () =>
      fromOpenAiResponse({
        choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{not json' } }] }, finish_reason: 'tool_calls' }],
      }),
    /malformed JSON/,
  )
})

test('refuses to call the API without an API key, before any network attempt', async () => {
  const provider = createOpenAiCompatProvider({ apiKey: undefined })
  const originalKey = process.env.OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY
  try {
    await assert.rejects(
      provider.complete({ messages: [{ role: 'user', content: 'hi' }], opts: { model: 'gpt-x' } }),
      /OPENAI_API_KEY is not set/,
    )
  } finally {
    if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey
  }
})
