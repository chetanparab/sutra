/**
 * A minimal in-repo MCP server used only by client.test.ts — it speaks exactly
 * the newline-delimited JSON-RPC the client expects (initialize, tools/list,
 * tools/call) and exposes two trivial tools. Not shipped; a test fixture that
 * proves the client against a real second process, not a mock.
 *
 * Tools:
 *   echo    → returns its `text` argument
 *   add     → returns a + b
 *   explode → always returns an error result (to test the error path)
 */
import { createInterface } from 'node:readline'

const TOOLS = [
  { name: 'echo', description: 'Echo the given text back.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'add', description: 'Add two numbers.', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] } },
  { name: 'explode', description: 'Always fails.', inputSchema: { type: 'object', properties: {} } },
]

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function handle(req) {
  const { id, method, params } = req
  if (method === 'initialize') {
    return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake-mcp', version: '0.0.1' } } })
  }
  if (method === 'notifications/initialized') return // notification, no reply
  if (method === 'tools/list') {
    return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
  }
  if (method === 'tools/call') {
    const { name, arguments: args } = params
    if (name === 'echo') return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(args.text) }] } })
    if (name === 'add') return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(Number(args.a) + Number(args.b)) }] } })
    if (name === 'explode') return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'kaboom' }], isError: true } })
    return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${name}` } })
  }
  if (typeof id === 'number') send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } })
}

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  try {
    handle(JSON.parse(trimmed))
  } catch {
    /* ignore malformed input */
  }
})
