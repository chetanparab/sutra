/**
 * The MCP client is exercised against a REAL second process — the fake server
 * fixture — so the newline-delimited JSON-RPC handshake, tool discovery, tool
 * calls, error results and namespacing are all proven over an actual stdio
 * pipe, not mocked.
 */
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { McpClient, connectMcpServers } from './client'

const FAKE_SERVER = join(dirname(fileURLToPath(import.meta.url)), 'fakeServer.mjs')
const serverConfig = { command: process.execPath, args: [FAKE_SERVER] }

test('connects, handshakes, and discovers namespaced tools', async () => {
  const client = new McpClient(serverConfig)
  await client.connect()
  try {
    const tools = await client.listTools()
    const names = tools.map((t) => t.name)
    assert.deepEqual(names.sort(), ['mcp__add', 'mcp__echo', 'mcp__explode'])
    // schema + description carried through
    const add = tools.find((t) => t.name === 'mcp__add')
    assert.ok(add)
    assert.match(add.description, /Add two numbers/)
    assert.equal(add.parameters.type, 'object')
  } finally {
    client.close()
  }
})

test('calls a tool and returns its text content', async () => {
  const client = new McpClient(serverConfig)
  await client.connect()
  try {
    const echo = await client.callTool('mcp__echo', { text: 'hello mcp' })
    assert.equal(echo.isError, false)
    assert.equal(echo.content, 'hello mcp')

    const add = await client.callTool('mcp__add', { a: 2, b: 40 })
    assert.equal(add.content, '42')
  } finally {
    client.close()
  }
})

test('a tool that returns an error result is surfaced as isError, not a throw', async () => {
  const client = new McpClient(serverConfig)
  await client.connect()
  try {
    const boom = await client.callTool('mcp__explode', {})
    assert.equal(boom.isError, true)
    assert.match(boom.content, /kaboom/)
  } finally {
    client.close()
  }
})

test('owns() distinguishes this client\'s namespaced tools', async () => {
  const client = new McpClient(serverConfig)
  await client.connect()
  try {
    assert.equal(client.owns('mcp__echo'), true)
    assert.equal(client.owns('read_file'), false)
  } finally {
    client.close()
  }
})

test('connectMcpServers aggregates tools and routes calls; a bad server is skipped, not fatal', async () => {
  const warnings: string[] = []
  const set = await connectMcpServers(
    [serverConfig, { command: 'definitely-not-a-real-mcp-server-xyz' }],
    (m) => warnings.push(m),
  )
  try {
    assert.equal(set.tools.length, 3) // only the good server's tools
    assert.ok(warnings.some((w) => /was skipped/.test(w)))
    const result = await set.callTool('mcp__add', { a: 1, b: 1 })
    assert.equal(result.content, '2')
    assert.equal(set.owns('mcp__echo'), true)
  } finally {
    set.close()
  }
})

test('a call to an unowned tool is a clean error, not a crash', async () => {
  const set = await connectMcpServers([serverConfig])
  try {
    const result = await set.callTool('nope__whatever', {})
    assert.equal(result.isError, true)
    assert.match(result.content, /No MCP client owns/)
  } finally {
    set.close()
  }
})
