/**
 * `sutra serve` — the local engine as an HTTP server, so the WEB IDE can run
 * REAL loops (ROADMAP.md Phase 5+ "web real-mode"). A browser tab can't touch
 * your files, run your tests, or (CORS) call most LLMs directly — so the honest
 * path is a tiny local process the web app talks to over localhost. This is
 * that process. It reuses the exact same engine the desktop shell drives; the
 * NDJSON it streams is byte-for-byte the desktop protocol, so the web client
 * parses it the same way.
 *
 * Security: bound to localhost only, and every mutating route requires a token
 * printed once at startup. A random web page can reach localhost but cannot
 * present the token, so it cannot drive your engine. The token — not CORS — is
 * the real gate; CORS is reflected so the trusted web app (localhost dev or the
 * deployed site) can connect.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { LlmProvider } from '../../../src/contracts/llm'
import { runLoop } from '../loop/runLoop'
import { plan } from '../plan/plan'
import { mergeShadowBranch } from '../merge/merge'
import { resolveProvider } from '../commands/build'
import { CLAUDE_CODE_PROVIDER_ID, createClaudeCliProvider, resolveClaudeBinary } from '../agents/claudeCode'
import { ENGINE_VERSION } from '../version'

interface ServeOptions {
  port: number
  /** Fixed token (tests); otherwise a random one is generated and printed. */
  token?: string
  onListening?: (info: { port: number; token: string }) => void
}

/** One loop at a time, mirroring the desktop's single-loop invariant. */
interface RunningLoop {
  abort: AbortController
}

export function startServer(opts: ServeOptions): { close: () => Promise<void>; token: string; port: number } {
  const token = opts.token ?? randomBytes(24).toString('base64url')
  let running: RunningLoop | null = null

  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      // Never leak internals to the caller; the route handlers send the
      // specific, safe messages the web needs.
      if (!res.headersSent) sendJson(res, 500, { error: 'Internal error.' })
      else res.end()
    })
  })

  // Only the trusted surfaces may cross-origin: localhost dev, and the deployed
  // site. An arbitrary web page gets no ACAO header, so the browser blocks it —
  // defence in depth on top of the token.
  const ALLOWED_ORIGIN = [/^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/127\.0\.0\.1(:\d+)?$/, /^https:\/\/sutra\.theanalogyarchitect\.com$/]
  function cors(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin
    if (origin && ALLOWED_ORIGIN.some((re) => re.test(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sutra-Token')
  }

  const tokenBuf = Buffer.from(token)
  function authed(req: IncomingMessage): boolean {
    const provided = req.headers['x-sutra-token']
    if (typeof provided !== 'string') return false
    const buf = Buffer.from(provided)
    return buf.length === tokenBuf.length && timingSafeEqual(buf, tokenBuf)
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    cors(req, res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname

    // Health is open (no token) so the web app can detect a running engine.
    if (req.method === 'GET' && path === '/health') {
      sendJson(res, 200, { ok: true, engine: ENGINE_VERSION, node: process.version })
      return
    }

    // Everything else mutates or reads your machine — token required.
    if (!authed(req)) {
      sendJson(res, 401, { error: 'Missing or invalid X-Sutra-Token. Paste the token printed by `sutra serve`.' })
      return
    }

    if (req.method === 'POST' && path === '/plan') {
      const body = await readJson(req)
      const workspaceRoot = String(body.workspacePath ?? '')
      const provider = webProvider(body, workspaceRoot)
      const result = await plan({ provider, model: String(body.model ?? 'default'), intent: String(body.intent ?? ''), workspaceRoot })
      sendJson(res, 200, { type: 'spec', ...result.spec })
      return
    }

    if (req.method === 'POST' && path === '/abort') {
      running?.abort.abort()
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && path === '/merge') {
      const body = await readJson(req)
      const result = mergeShadowBranch({
        workspaceRoot: String(body.workspacePath ?? ''),
        branchName: String(body.branchName ?? ''),
        targetBranch: String(body.targetBranch ?? 'main'),
        mode: body.pr === true ? 'pr' : 'merge',
      })
      sendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && path === '/loop') {
      await handleLoop(req, res)
      return
    }

    sendJson(res, 404, { error: `No route ${req.method} ${path}` })
  }

  async function handleLoop(req: IncomingMessage, res: ServerResponse) {
    if (running) {
      sendJson(res, 409, { error: 'A loop is already running — abort it first.' })
      return
    }
    const body = await readJson(req)
    applyKeyEnv(body) // place the API key in env before runLoop resolves the provider
    const abort = new AbortController()
    running = { abort }

    // NDJSON stream — identical to the desktop `--events ndjson` protocol, so
    // the web client's parser is the same one the desktop uses.
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    const write = (obj: unknown) => res.write(JSON.stringify(obj) + '\n')

    try {
      const outcome = await runLoop({
        workspacePath: String(body.workspacePath ?? ''),
        intent: String(body.intent ?? ''),
        providerId: String(body.provider ?? ''),
        model: String(body.model ?? 'default'),
        // Deliberately NOT accepting a verify command over HTTP — the web can't
        // inject an arbitrary command to run. The engine auto-detects the
        // project's own test command (npm test / cargo test / …) from the files.
        consentToRun: true,
        maxIterations: Number(body.maxIterations ?? 3),
        initIfNeeded: body.initIfNeeded === true,
        verifyMode: body.verifyMode === 'container' ? 'container' : 'local',
        verifyImage: body.verifyImage ? String(body.verifyImage) : undefined,
        verifyAllowNetwork: body.verifyAllowNetwork === true,
        mcpServers: Array.isArray(body.mcpServers)
          ? body.mcpServers
              .map(String)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((spec) => {
                const [command, ...args] = spec.split(/\s+/)
                return { command, args }
              })
          : undefined,
        signal: abort.signal,
        onEvent: (e) => write({ type: 'event', ...e }),
        onMemo: (m) => write({ type: 'memo', ...m }),
        onLog: (line) => write({ type: 'log', line }),
      })
      write({ type: 'outcome', ...outcome })
    } catch (err) {
      write({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      running = null
      res.end()
    }
  }

  server.listen(opts.port, '127.0.0.1', () => {
    opts.onListening?.({ port: opts.port, token })
  })

  return {
    token,
    port: opts.port,
    close: () =>
      new Promise((resolve) => {
        running?.abort.abort()
        server.close(() => resolve())
      }),
  }
}

/**
 * The web sends the API key in the request body (over localhost); we set it as
 * an env var for this process's run, exactly as the desktop host does — never
 * logged, never persisted here. claude-code needs no key.
 */
function applyKeyEnv(body: Record<string, unknown>): void {
  const provider = String(body.provider ?? '')
  const key = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  if (!key) return
  if (provider === 'anthropic') process.env.ANTHROPIC_API_KEY = key
  else if (provider === 'openai-compat') process.env.OPENAI_API_KEY = key
}

/** Resolve a real provider for the one-shot /plan route (runLoop resolves its own). */
function webProvider(body: Record<string, unknown>, workspaceRoot: string): LlmProvider {
  applyKeyEnv(body)
  const providerId = String(body.provider ?? '')
  if (providerId === CLAUDE_CODE_PROVIDER_ID) {
    const bin = resolveClaudeBinary()
    if (!bin) throw new Error('Claude Code CLI not found. Run `claude` once to sign in, or use a provider with an API key.')
    return createClaudeCliProvider(bin, workspaceRoot, { usd: 0 })
  }
  return resolveProvider(providerId)
}

function sendJson(res: ServerResponse, status: number, obj: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 5_000_000) reject(new Error('Request body too large.'))
    })
    req.on('end', () => {
      try {
        resolve(data ? (JSON.parse(data) as Record<string, unknown>) : {})
      } catch {
        reject(new Error('Invalid JSON body.'))
      }
    })
    req.on('error', reject)
  })
}
