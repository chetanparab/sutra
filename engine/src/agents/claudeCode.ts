/**
 * Claude Code as the loop's model — no API key required (dogfooding request:
 * "user will not always have an Anthropic API key").
 *
 * Instead of talking to an HTTP API, this drives the user's locally installed
 * Claude Code CLI in its documented headless mode (`claude -p`). Whatever the
 * user signed into locally — a claude.ai Pro/Max subscription or an API key —
 * is what runs the loop. Sutra never reads, stores or forwards any credential:
 * the CLI's own keychain auth stays entirely inside the CLI process.
 *
 * Division of labor per loop phase:
 * - Build: one `claude -p` run inside the workspace. Claude Code uses its own
 *   file tools (whitelisted to read/search/edit — Bash is NOT allowed, so the
 *   verify command stays user-owned and nothing executes during Build).
 * - Reflect: a single-turn `claude -p --max-turns 1` completion, exposed as an
 *   LlmProvider so the existing reflect() memo logic is reused unchanged.
 */
import { spawn, spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ChatMessage, Completion, LlmProvider } from '../../../src/contracts/llm'

export const CLAUDE_CODE_PROVIDER_ID = 'claude-code'

/** File-only toolset for Build: no Bash, no web — edits happen, commands don't. */
const BUILD_ALLOWED_TOOLS = 'Read,Glob,Grep,LS,Edit,MultiEdit,Write'

const BUILD_TIMEOUT_MS = 15 * 60_000
const REFLECT_TIMEOUT_MS = 3 * 60_000

/**
 * Find the claude binary. A desktop .app inherits the skeletal GUI PATH
 * (usually just /usr/bin:/bin:…), so probing PATH alone would miss almost
 * every real install — the common install locations are probed explicitly.
 * SUTRA_CLAUDE_BIN overrides everything (also the seam the tests use).
 */
export function resolveClaudeBinary(env: NodeJS.ProcessEnv = process.env): string | null {
  const home = env.HOME ?? homedir()
  const candidates = [
    env.SUTRA_CLAUDE_BIN,
    'claude',
    join(home, '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    join(home, '.local', 'bin', 'claude'),
    join(home, '.npm-global', 'bin', 'claude'),
  ].filter((c): c is string => typeof c === 'string' && c !== '')

  for (const candidate of candidates) {
    try {
      const probe = spawnSync(candidate, ['--version'], { env, encoding: 'utf8', timeout: 10_000 })
      if (probe.status === 0) return candidate
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

export interface ClaudeCodeRunResult {
  finalText: string
  costUsd: number
  inputTokens: number
  outputTokens: number
}

interface StreamLine {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
  total_cost_usd?: number
  usage?: { input_tokens?: number; output_tokens?: number }
  message?: { content?: Array<{ type?: string; text?: string; name?: string; input?: { file_path?: string } }> }
}

function friendlyFailure(stderrTail: string, exitCode: number | null): Error {
  if (/log ?in|logged in|authenticate|credentials|OAuth/i.test(stderrTail)) {
    return new Error(
      'Claude Code is not signed in. Open a terminal, run `claude`, and sign in once (your claude.ai account or an API key) — then launch the loop again.',
    )
  }
  return new Error(`Claude Code exited with code ${exitCode}${stderrTail ? `: ${stderrTail.slice(-400)}` : '.'}`)
}

/**
 * One Build pass: hand Claude Code the prompt, let it edit the workspace with
 * its own (file-only) tools, and collect the final summary + real cost from the
 * stream. `onLog` receives a human-readable line per assistant step — the
 * desktop's live engine-output panel renders these as they happen.
 */
export function runClaudeCodeBuild(params: {
  bin: string
  workspaceRoot: string
  prompt: string
  /** 'sonnet' | 'opus' | 'haiku' | full model id; 'default' uses the CLI's configured model. */
  model?: string
  maxTurns?: number
  timeoutMs?: number
  signal?: AbortSignal
  onLog?: (line: string) => void
}): Promise<ClaudeCodeRunResult> {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    BUILD_ALLOWED_TOOLS,
    '--max-turns',
    String(params.maxTurns ?? 30),
  ]
  if (params.model && params.model !== 'default') args.push('--model', params.model)

  return runClaude({ ...params, args, timeoutMs: params.timeoutMs ?? BUILD_TIMEOUT_MS })
}

/** Shared spawn + stream-parse for both Build and the reflect provider. */
function runClaude(params: {
  bin: string
  workspaceRoot: string
  prompt: string
  args: string[]
  timeoutMs: number
  signal?: AbortSignal
  onLog?: (line: string) => void
}): Promise<ClaudeCodeRunResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(params.bin, params.args, {
      cwd: params.workspaceRoot,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let settled = false
    let stdoutBuf = ''
    let stderrTail = ''
    let result: ClaudeCodeRunResult | null = null

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      params.signal?.removeEventListener('abort', onAbort)
      fn()
    }

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref()
      finish(() => rejectPromise(new Error(`Claude Code timed out after ${Math.round(params.timeoutMs / 60_000)} minutes.`)))
    }, params.timeoutMs)

    const onAbort = () => {
      child.kill('SIGTERM')
      finish(() => rejectPromise(new DOMException('Claude Code run aborted.', 'AbortError')))
    }
    if (params.signal?.aborted) {
      onAbort()
      return
    }
    params.signal?.addEventListener('abort', onAbort, { once: true })

    const ingest = (raw: string) => {
      let line: StreamLine
      try {
        line = JSON.parse(raw) as StreamLine
      } catch {
        return // progress noise / partial line — never fatal
      }
      if (line.type === 'assistant') {
        for (const part of line.message?.content ?? []) {
          if (part.type === 'text' && part.text?.trim()) params.onLog?.(`claude: ${part.text.trim().slice(0, 200)}`)
          else if (part.type === 'tool_use' && part.name) {
            const target = part.input?.file_path ? ` ${part.input.file_path}` : ''
            params.onLog?.(`claude → ${part.name}${target}`)
          }
        }
      } else if (line.type === 'result') {
        result = {
          finalText: typeof line.result === 'string' ? line.result : '',
          costUsd: typeof line.total_cost_usd === 'number' ? line.total_cost_usd : 0,
          inputTokens: line.usage?.input_tokens ?? 0,
          outputTokens: line.usage?.output_tokens ?? 0,
        }
        if (line.is_error) {
          finish(() => rejectPromise(new Error(`Claude Code reported an error${result?.finalText ? `: ${result.finalText.slice(0, 400)}` : '.'}`)))
        }
      }
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8')
      let nl = stdoutBuf.indexOf('\n')
      while (nl !== -1) {
        const raw = stdoutBuf.slice(0, nl).trim()
        stdoutBuf = stdoutBuf.slice(nl + 1)
        if (raw !== '') ingest(raw)
        nl = stdoutBuf.indexOf('\n')
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stderrTail = (stderrTail + text).slice(-2000)
      for (const l of text.split('\n')) if (l.trim()) params.onLog?.(l.trim())
    })

    child.on('error', (err) =>
      finish(() =>
        rejectPromise(
          new Error(`Could not start Claude Code (${params.bin}): ${err instanceof Error ? err.message : String(err)}`),
        ),
      ),
    )
    child.on('close', (code) => {
      if (stdoutBuf.trim() !== '') ingest(stdoutBuf.trim()) // a final line without \n
      finish(() => {
        if (result && code === 0) resolvePromise(result)
        else if (result && result.finalText !== '') resolvePromise(result)
        else rejectPromise(friendlyFailure(stderrTail, code))
      })
    })

    child.stdin.write(params.prompt)
    child.stdin.end()
  })
}

/**
 * A minimal LlmProvider over single-turn `claude -p` — enough for Reflect's
 * memo call (and any future no-tool completion). Tool-use requests are refused
 * loudly: Build in claude-code mode goes through runClaudeCodeBuild, never here.
 * `costRef` accumulates the real cost the CLI reports across calls.
 */
export function createClaudeCliProvider(
  bin: string,
  workspaceRoot: string,
  costRef: { usd: number },
): LlmProvider {
  return {
    id: CLAUDE_CODE_PROVIDER_ID,
    async complete({ messages, tools, opts }) {
      if (tools && tools.length > 0) {
        throw new Error('The claude-code provider does not serve tool-use completions — Build runs through Claude Code itself.')
      }
      const prompt = flattenMessages(messages)
      const args = ['-p', '--output-format', 'stream-json', '--verbose', '--max-turns', '1']
      if (opts.model && opts.model !== 'default') args.push('--model', opts.model)

      const run = await runClaude({
        bin,
        workspaceRoot,
        prompt,
        args,
        timeoutMs: REFLECT_TIMEOUT_MS,
        signal: opts.signal,
      })
      costRef.usd += run.costUsd
      const completion: Completion = {
        text: run.finalText,
        stopReason: 'stop',
        usage: { inputTokens: run.inputTokens, outputTokens: run.outputTokens },
      }
      return completion
    },
  }
}

/** System/user/assistant history → one plain prompt (single-turn calls only). */
function flattenMessages(messages: ChatMessage[]): string {
  return messages
    .map((m) => (m.role === 'system' ? m.content : `${m.role.toUpperCase()}:\n${m.content}`))
    .join('\n\n')
}

/** The Build prompt for Claude Code — the harness owns commit + verify. */
export function claudeCodeBuildPrompt(intentForBuild: string, verifyCommand?: string): string {
  const verifyLine = verifyCommand
    ? `After you finish, the harness commits your work and runs the verify command \`${verifyCommand}\`. Do NOT run it (or any command) yourself.`
    : 'After you finish, the harness commits your work, auto-detects how to verify it (a test script, build, etc.) and runs that. If this is a new or untested project, set it up so it CAN be checked — add a runnable test or a "test"/"build" script — but do NOT run anything yourself.'
  return (
    'You are the Build phase of an iteration loop working in this repository.\n\n' +
    `INTENT:\n${intentForBuild}\n\n` +
    'Rules:\n' +
    '- Make the smallest change that satisfies the intent; do not refactor unrelated code.\n' +
    '- Create or edit files in this project only. Do NOT run shell commands, tests, or git.\n' +
    `- ${verifyLine}\n` +
    '- When you are done, reply with a one-paragraph summary of what you changed.'
  )
}
