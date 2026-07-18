/**
 * BYO-agent (ROADMAP.md Phase 5, issue #9): a minimal Model Context Protocol
 * stdio client. It spawns a user-configured MCP server, does the initialize
 * handshake, discovers the server's tools, and calls them on the model's
 * behalf — so the Build phase's agent can use the user's OWN tools (a search
 * index, a linter, a company API, …) alongside the engine's built-in fs tools.
 *
 * Deliberately small: newline-delimited JSON-RPC 2.0 over stdio, exactly the
 * three flows the Build loop needs — initialize, tools/list, tools/call. No
 * external SDK, so the wire protocol is visible in this one file.
 *
 * Trust note: an MCP server is a program the USER chose to run (like their
 * verify command), spawned as an argv array (no shell). Its tool *descriptions*
 * become model-visible text — treated as data, same as repo content
 * (SECURITY.md): the model may be told what a tool does, but the hard
 * boundaries (workspace-root fs guard, human-gated merge, consent) are
 * unaffected by anything an MCP server says.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { ToolDef } from '../../../src/contracts/llm'

export interface McpServerConfig {
  command: string
  args?: string[]
  /** Extra env for the server process (merged over the current env). */
  env?: Record<string, string>
  /** Prefix added to each tool name so MCP tools can't collide with fs tools. Default "mcp__". */
  namespace?: string
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

interface McpToolDescriptor {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

const PROTOCOL_VERSION = '2024-11-05'
const DEFAULT_NAMESPACE = 'mcp__'

export class McpClient {
  private proc: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private buffer = ''
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private readonly namespace: string
  private closed = false

  constructor(private readonly config: McpServerConfig) {
    this.namespace = config.namespace ?? DEFAULT_NAMESPACE
  }

  /** Spawn the server and complete the MCP initialize handshake. */
  async connect(timeoutMs = 15_000): Promise<void> {
    const proc = spawn(this.config.command, this.config.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.config.env },
    })
    this.proc = proc
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => this.onData(chunk))
    proc.on('exit', () => this.failAll(new Error('MCP server exited')))
    proc.on('error', (err) => this.failAll(err instanceof Error ? err : new Error(String(err))))

    await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'sutra-engine', version: '2.0' },
    }, timeoutMs)
    // Per spec, the client confirms it's ready with a notification (no reply).
    this.notify('notifications/initialized', {})
  }

  /** Discover the server's tools, namespaced and shaped as engine ToolDefs. */
  async listTools(): Promise<ToolDef[]> {
    const result = (await this.request('tools/list', {})) as { tools?: McpToolDescriptor[] }
    return (result.tools ?? []).map((t) => ({
      name: `${this.namespace}${t.name}`,
      description: t.description ?? `MCP tool ${t.name}`,
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    }))
  }

  /** Whether a (namespaced) tool name belongs to this client. */
  owns(namespacedName: string): boolean {
    return namespacedName.startsWith(this.namespace)
  }

  /** Call a namespaced MCP tool, returning its text content for a tool-result. */
  async callTool(namespacedName: string, args: Record<string, unknown>): Promise<{ content: string; isError: boolean }> {
    const name = namespacedName.slice(this.namespace.length)
    try {
      const result = (await this.request('tools/call', { name, arguments: args })) as {
        content?: { type: string; text?: string }[]
        isError?: boolean
      }
      const text = (result.content ?? [])
        .map((c) => (c.type === 'text' ? (c.text ?? '') : `[${c.type}]`))
        .join('\n')
      return { content: text || '(the tool returned no content)', isError: result.isError === true }
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true }
    }
  }

  close(): void {
    this.closed = true
    this.failAll(new Error('MCP client closed'))
    this.proc?.kill()
    this.proc = null
  }

  // ── JSON-RPC plumbing ──────────────────────────────────────────────────────

  private request(method: string, params: unknown, timeoutMs = 30_000): Promise<unknown> {
    if (!this.proc || this.closed) return Promise.reject(new Error('MCP client is not connected'))
    const id = this.nextId++
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })
      this.proc!.stdin.write(payload)
    })
  }

  private notify(method: string, params: unknown): void {
    this.proc?.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let nl: number
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nl).trim()
      this.buffer = this.buffer.slice(nl + 1)
      if (!line) continue
      let msg: JsonRpcResponse
      try {
        msg = JSON.parse(line) as JsonRpcResponse
      } catch {
        continue // ignore non-JSON lines (some servers log to stdout)
      }
      if (typeof msg.id !== 'number') continue // a notification from the server; nothing to resolve
      const waiter = this.pending.get(msg.id)
      if (!waiter) continue
      this.pending.delete(msg.id)
      if (msg.error) waiter.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`))
      else waiter.resolve(msg.result)
    }
  }

  private failAll(err: Error): void {
    for (const waiter of this.pending.values()) waiter.reject(err)
    this.pending.clear()
  }
}

/**
 * Connect every configured MCP server and gather their tools into one set,
 * plus a dispatcher that routes a namespaced tool call to the right client.
 * Servers that fail to start are skipped with a warning (a bad optional tool
 * source must not sink the whole Build).
 */
export interface McpToolset {
  tools: ToolDef[]
  clients: McpClient[]
  callTool(name: string, args: Record<string, unknown>): Promise<{ content: string; isError: boolean }>
  owns(name: string): boolean
  close(): void
}

export async function connectMcpServers(configs: McpServerConfig[], warn: (m: string) => void = () => {}): Promise<McpToolset> {
  const clients: McpClient[] = []
  const tools: ToolDef[] = []
  for (const config of configs) {
    const client = new McpClient(config)
    try {
      await client.connect()
      tools.push(...(await client.listTools()))
      clients.push(client)
    } catch (err) {
      client.close()
      warn(`MCP server "${config.command}" was skipped: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return {
    tools,
    clients,
    owns: (name) => clients.some((c) => c.owns(name)),
    async callTool(name, args) {
      const client = clients.find((c) => c.owns(name))
      if (!client) return { content: `No MCP client owns tool "${name}".`, isError: true }
      return client.callTool(name, args)
    },
    close: () => clients.forEach((c) => c.close()),
  }
}
