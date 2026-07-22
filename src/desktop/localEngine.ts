/**
 * Web real-mode (ROADMAP.md Phase 5+): the browser side of the local bridge.
 * When the user runs `sutra serve` on their machine, the web IDE connects to it
 * over localhost and runs the SAME real loop the desktop shell does — the
 * transport is HTTP + NDJSON instead of Tauri invoke/events, but the protocol
 * and the surfaces are identical.
 *
 * A browser tab cannot read your files, run your tests, or (CORS) call most
 * LLMs directly — so this bridge is the honest way the web runs for real. The
 * connection (url + token) is remembered in localStorage so a reload stays
 * connected; the token is what authorizes the web app to drive the engine.
 */
import { parseEngineLine, type RealLoopArgs, type RealLoopHandle, type RealLoopHandlers, type MergeClickResult, type PlannedSpec, type DraftSpecArgs } from './realLoop'

const STORAGE_KEY = 'sutra.localEngine.v1'

interface Conn {
  url: string
  token: string
}

let conn: Conn | null = readStored()

function readStored(): Conn | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Conn
    return c.url && c.token ? c : null
  } catch {
    return null
  }
}

/** Whether the web app is connected to a local engine (web real-mode is live). */
export function isLocalEngine(): boolean {
  return conn !== null
}

export function localEngineUrl(): string | null {
  return conn?.url ?? null
}

export function disconnectLocalEngine(): void {
  conn = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Health-check a candidate engine; on success, remember it. Returns its version. */
export async function connectLocalEngine(url: string, token: string): Promise<{ engine: string; node: string }> {
  const base = url.replace(/\/+$/, '')
  const res = await fetch(`${base}/health`, { method: 'GET' })
  if (!res.ok) throw new Error(`No engine responded at ${base} (HTTP ${res.status}).`)
  const info = (await res.json()) as { ok?: boolean; engine?: string; node?: string }
  if (!info.ok) throw new Error(`That URL responded, but it isn’t a Sutra engine.`)
  conn = { url: base, token: token.trim() }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conn))
  } catch {
    /* private mode — connection stays for this session only */
  }
  return { engine: info.engine ?? '?', node: info.node ?? '?' }
}

function headers(): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-Sutra-Token': conn?.token ?? '' }
}

function requireConn(): Conn {
  if (!conn) throw new Error('Not connected to a local engine. Run `sutra serve` and connect first.')
  return conn
}

/** Start a real loop over the bridge; parses the NDJSON stream into the same handlers the desktop uses. */
export async function startRealLoopHttp(args: RealLoopArgs, handlers: RealLoopHandlers): Promise<RealLoopHandle> {
  const c = requireConn()
  const controller = new AbortController()
  let disposed = false

  const res = await fetch(`${c.url}/loop`, { method: 'POST', headers: headers(), body: JSON.stringify(toWire(args)), signal: controller.signal }).catch((err) => {
    throw new Error(`Could not reach the local engine (${c.url}). Is \`sutra serve\` still running? ${err instanceof Error ? err.message : ''}`)
  })
  if (res.status === 401) throw new Error('The local engine rejected the token. Reconnect with the token it printed.')
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`The local engine returned HTTP ${res.status}. ${text.slice(0, 200)}`)
  }

  // Pump the NDJSON stream in the background, dispatching to handlers.
  ;(async () => {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done || disposed) break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) !== -1) {
          const raw = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (raw) dispatch(raw, handlers)
        }
      }
    } catch {
      if (!disposed) handlers.onError?.('The connection to the local engine dropped.')
    } finally {
      handlers.onExit?.(0)
    }
  })()

  return {
    abort: async () => {
      // Ask the engine to stop cleanly (rolls back the current iteration), then
      // stop reading. A best-effort call — the stream ends either way.
      await fetch(`${c.url}/abort`, { method: 'POST', headers: headers() }).catch(() => {})
    },
    dispose: () => {
      disposed = true
      controller.abort()
    },
  }
}

/** One NDJSON line → the right handler. Logs use {type:'log'}; the rest reuse parseEngineLine. */
function dispatch(raw: string, handlers: RealLoopHandlers) {
  try {
    const obj = JSON.parse(raw) as { type?: string; line?: string }
    if (obj.type === 'log') {
      handlers.onLog?.(typeof obj.line === 'string' ? obj.line : '')
      return
    }
  } catch {
    return
  }
  const line = parseEngineLine(raw)
  if (!line) return
  if (line.type === 'event') handlers.onEvent?.(line)
  else if (line.type === 'memo') handlers.onMemo?.(line)
  else if (line.type === 'error') handlers.onError?.(line.message)
  else handlers.onOutcome?.(line)
}

export async function draftSpecHttp(args: DraftSpecArgs): Promise<PlannedSpec> {
  const c = requireConn()
  const res = await fetch(`${c.url}/plan`, { method: 'POST', headers: headers(), body: JSON.stringify(toWire(args)) })
  if (res.status === 401) throw new Error('The local engine rejected the token. Reconnect with the token it printed.')
  if (!res.ok) throw new Error(`Planning failed (HTTP ${res.status}): ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const parsed = (await res.json()) as Partial<PlannedSpec>
  return {
    requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
    approach: typeof parsed.approach === 'string' ? parsed.approach : '',
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
  }
}

export async function mergeBranchHttp(workspacePath: string, branchName: string, targetBranch: string): Promise<MergeClickResult> {
  const c = requireConn()
  const res = await fetch(`${c.url}/merge`, { method: 'POST', headers: headers(), body: JSON.stringify({ workspacePath, branchName, targetBranch }) })
  const result = (await res.json().catch(() => ({}))) as { status?: string; reason?: string; targetBranch?: string; sha?: string; url?: string }
  if (result.status === 'merged') return { ok: true, message: `Merged into ${result.targetBranch} at ${(result.sha ?? '').slice(0, 8)}.` }
  if (result.status === 'pr-created') return { ok: true, message: `Opened ${result.url}` }
  return { ok: false, message: result.reason ?? `Merge failed (HTTP ${res.status}).` }
}

/** The server reads the same camelCase field names RealLoopArgs/DraftSpecArgs use. */
function toWire(args: object): Record<string, unknown> {
  return { ...args } as Record<string, unknown>
}
