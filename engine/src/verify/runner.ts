/**
 * The Phase 2 Verify runner (ROADMAP.md, issue #18): executes the repo's
 * configured test/lint command against the shadow branch's committed state and
 * reports pass/fail from the exit code.
 *
 * Two hard rules, both load-bearing for safety:
 *
 * 1. **The command is the user's own, never model-authored.** It comes from a
 *    CLI flag the human typed (like an npm script they'd run themselves) — the
 *    model has no tool that can set or alter it. That's why running it through
 *    a shell is acceptable here: the trust level is "the user's own shell
 *    command", not "model output".
 *
 * 2. **Consent is explicit, at compile time and run time.** `consentToRun`
 *    must be the literal `true` — there is no way to call this from typed code
 *    without writing it out, and the CLI only sets it when the human passed
 *    --allow-run. This executes real commands and any code the agent just
 *    modified; on repos you don't trust, that is the whole attack.
 */
import { spawnSync } from 'node:child_process'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024

export interface VerifyRunParams {
  workspaceRoot: string
  /** The user's own verify command (e.g. "npm test", "node check.mjs"). Never model-authored. */
  command: string
  /** Must be literally `true` — the human's explicit consent to execute commands. */
  consentToRun: true
  timeoutMs?: number
}

export interface VerifyRunResult {
  passed: boolean
  exitCode: number | null
  /** The signal that terminated the process, if any (e.g. SIGTERM on timeout). */
  termSignal: string | null
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
}

export function runVerifyCommand(params: VerifyRunParams): VerifyRunResult {
  // The type system already forces `consentToRun: true`, but a runtime check
  // guards the untyped call paths (plain JS, JSON-driven config).
  if (params.consentToRun !== true) {
    throw new Error('Verify refused: consentToRun must be explicitly true. This executes real commands on your machine.')
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const startedAt = Date.now()

  const result = spawnSync(params.command, {
    cwd: params.workspaceRoot,
    shell: true,
    timeout: timeoutMs,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const durationMs = Date.now() - startedAt
  const timedOut = result.error !== undefined && 'code' in result.error && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT'

  if (result.error && !timedOut) {
    throw new Error(`Verify command failed to start: ${result.error.message}`)
  }

  return {
    passed: !timedOut && result.status === 0,
    exitCode: result.status,
    termSignal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs,
    timedOut,
  }
}

/**
 * The tail of a verify run's combined output, sized for a Reflect prompt —
 * failures usually print their most useful information last (assertion diffs,
 * summary lines), and sending a 10MB log to a model is a cost bug.
 */
export function outputTailForMemo(result: VerifyRunResult, maxChars = 4000): string {
  const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  if (combined.length <= maxChars) return combined
  return `…(truncated)…\n${combined.slice(-maxChars)}`
}
