/**
 * sutra-engine — the plumbing + real-Build CLI. Thin argv dispatch only; the
 * actual logic lives in ./commands so it's directly unit-testable without
 * spawning a subprocess. See ROADMAP.md.
 */
import { applyTestEdit } from './commands/applyTestEdit'
import { build, KNOWN_PROVIDER_IDS } from './commands/build'
import { rollbackCommand } from './commands/rollback'
import { parseArgs } from './cliArgs'
import { DEFAULT_GUARDRAILS } from './build/guardrails'
import { estimateCeilingUsd, formatUsd } from './build/costEstimate'
import { runLoop } from './loop/runLoop'
import { mergeShadowBranch } from './merge/merge'
import { plan } from './plan/plan'
import { resolveProvider } from './commands/build'
import { CLAUDE_CODE_PROVIDER_ID, createClaudeCliProvider, resolveClaudeBinary } from './agents/claudeCode'
import { resolve as resolvePath } from 'node:path'

function usage(): never {
  console.error(`sutra-engine — Phase 0/1/2 CLI (see ROADMAP.md)

Usage:
  npm run engine -- version
      Prints {engine, node} as JSON — the desktop shell's sidecar handshake.

  npm run engine -- apply-test-edit <workspace-path>
      Phase 0 demo: applies a scripted edit to src/greet.ts on a new shadow
      branch and commits it. If <workspace-path> doesn't exist, materializes
      the toy-repo fixture there first. No LLM, no cost.

  npm run engine -- rollback <workspace-path> <sha>
      Hard-resets the repo at <workspace-path> to <sha>.

  npm run engine -- build <workspace-path> <intent> --provider <${KNOWN_PROVIDER_IDS.join('|')}> --model <model-id>
      Phase 1: a real LLM call proposes a real, structured edit to a real
      repo, on a new shadow branch. Requires the repo to already exist — it
      does not bootstrap a fixture. Requires an API key as an environment
      variable (ANTHROPIC_API_KEY or OPENAI_API_KEY) — never pass it as a
      flag, it would leak into your shell history. Ctrl+C aborts cleanly:
      nothing is committed and no partial edit is left on disk.

  npm run engine -- loop <workspace-path> <intent> --provider <id> --model <model-id> \\
      --verify-cmd "<command>" --allow-run true [--max-iterations N] [--reflect-model <id>] \\
      [--verify-timeout-ms N] [--events ndjson] \\
      [--verify-mode local|container] [--verify-image <image>] [--verify-network true] \\
      [--mcp-server "<command> <args…>"] [--init-if-needed true]
      --verify-mode container runs the verify command in a throwaway Docker
      container (only the workspace mounted, network off) instead of on the
      host — isolation for untrusted repos. --verify-image sets the toolchain
      image (e.g. node:alpine); --verify-network true re-enables the network.
      --mcp-server plugs in your own MCP server whose tools the Build phase's
      model can use alongside the built-in file tools (repeat with ';;').
      --init-if-needed true starts a NEW project in a plain/empty folder:
      git init + an empty initial commit, instead of refusing a non-git path.
      --provider claude-code needs NO API key: it drives your locally installed,
      signed-in Claude Code CLI (claude.ai subscription or its key) in headless
      mode. Build edits files through Claude Code's own file tools (no Bash);
      --model accepts sonnet | opus | haiku | a full id | default.
      Phase 2: the full real loop — Build, commit, VERIFY BY ACTUALLY RUNNING
      your command, Reflect on the failure, iterate, until verification
      passes or the budget is spent.
      --verify-cmd is YOUR command (like an npm script you'd run yourself) —
      the model can never author or alter it. --allow-run is the explicit
      consent to execute commands on this machine: verification runs code the
      agent just modified, so only use it on repos you trust.

  npm run engine -- plan <workspace-path> <intent> --provider <id> --model <model-id> [--events ndjson]
      Spec mode (Phase 5+): one LLM call drafts a spec — requirements, an
      approach and a task list — grounded in the repo, for you to review before
      any code is written. No file writes, no execution. The loop runs the
      approved spec afterwards. --events ndjson emits one {type:'spec',…} line.

  npm run engine -- merge <workspace-path> <shadow-branch> --into <target-branch> [--pr true]
      Phase 3: land a finished shadow branch — fast-forward, or rebase then
      fast-forward if the target moved on. Conflicts and dirty worktrees are
      clean refusals, never forced. --pr true pushes the branch and opens a
      GitHub PR via gh instead of merging locally. Merge is ALWAYS explicit —
      you are the gate; nothing in the engine calls this on its own.
`)
  process.exit(1)
}

async function runBuild(positional: string[], flags: Record<string, string>): Promise<void> {
  const [workspacePath, intent] = positional
  if (!workspacePath || !intent || !flags.provider || !flags.model) usage()

  const ceiling = estimateCeilingUsd(DEFAULT_GUARDRAILS.maxTokens)
  console.log(`Provider: ${flags.provider} · model: ${flags.model}`)
  console.log(`Budget: up to ${DEFAULT_GUARDRAILS.maxToolTurns} tool turns, ${DEFAULT_GUARDRAILS.maxTokens} tokens (worst case ${formatUsd(ceiling)}).`)
  console.log('Press Ctrl+C at any time to abort cleanly.\n')

  const controller = new AbortController()
  process.on('SIGINT', () => {
    console.error('\nInterrupted — aborting (no changes will be committed)…')
    controller.abort()
  })

  const outcome = await build({ workspacePath, intent, providerId: flags.provider, model: flags.model, signal: controller.signal })

  if (outcome.status === 'converged') {
    console.log(`Created shadow branch "${outcome.branchName}".`)
    console.log(`Committed iteration 1: ${outcome.commitSha.slice(0, 8)} (${outcome.turns} tool-use turn${outcome.turns === 1 ? '' : 's'}, ${formatUsd(outcome.actualCostUsd)} actual).`)
    console.log(`\nModel summary: ${outcome.finalText}`)
    console.log('\n--- diff since branch point — review before merging ---')
    console.log(outcome.diff)
  } else {
    console.log(`\n${outcome.status === 'aborted' ? 'Aborted.' : 'Stopped — guardrail tripped.'} ${outcome.message}`)
    process.exitCode = 1
  }
}

/**
 * Spec-mode-real: draft a spec (requirements/approach/tasks) for review. One
 * LLM call, no file writes, no execution — the loop runs the approved spec
 * afterwards. With --events ndjson, emits one {type:'spec', …} line for the
 * desktop shell; otherwise pretty-prints the JSON.
 */
async function runPlanCommand(positional: string[], flags: Record<string, string>): Promise<void> {
  const [workspacePath, intent] = positional
  if (!workspacePath || !intent || !flags.provider || !flags.model) usage()

  const ndjson = flags.events === 'ndjson'
  if (flags.events && !ndjson) {
    console.error('--events supports only: ndjson')
    process.exit(1)
  }
  const say = (line: string) => (ndjson ? console.error(line) : console.log(line))
  const workspaceRoot = resolvePath(workspacePath)

  let provider
  if (flags.provider === CLAUDE_CODE_PROVIDER_ID) {
    const bin = resolveClaudeBinary()
    if (!bin) {
      console.error('Claude Code CLI not found. Install it and run `claude` once to sign in — or pick a provider with an API key.')
      process.exit(1)
    }
    provider = createClaudeCliProvider(bin, workspaceRoot, { usd: 0 })
  } else {
    provider = resolveProvider(flags.provider)
  }

  say('Drafting the spec…')
  const controller = new AbortController()
  const onSigint = () => controller.abort()
  process.on('SIGINT', onSigint)
  try {
    const result = await plan({ provider, model: flags.model, intent, workspaceRoot, signal: controller.signal })
    if (ndjson) console.log(JSON.stringify({ type: 'spec', ...result.spec }))
    else console.log(JSON.stringify(result.spec, null, 2))
  } finally {
    process.off('SIGINT', onSigint)
  }
}

async function runLoopCommand(positional: string[], flags: Record<string, string>): Promise<void> {
  const [workspacePath, intent] = positional
  // --verify-cmd is OPTIONAL now: without it the engine auto-detects how to
  // verify the workspace after each Build.
  if (!workspacePath || !intent || !flags.provider || !flags.model) usage()

  // Consent must be the explicit flag — not inferred, not defaulted.
  if (!('allow-run' in flags)) {
    console.error('Refusing to run: the loop executes your verify command (and code the agent just modified) on this machine.')
    console.error('Pass --allow-run true to consent. Only do this on repos you trust.')
    process.exit(1)
  }

  const maxIterations = flags['max-iterations'] ? Number(flags['max-iterations']) : 3
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 10) {
    console.error('--max-iterations must be an integer between 1 and 10.')
    process.exit(1)
  }

  // --events ndjson: the machine mode the desktop shell consumes. One JSON
  // object per stdout line, emitted the moment it happens; the human-readable
  // narration moves entirely to stderr so stdout stays parseable.
  const ndjson = flags.events === 'ndjson'
  if (flags.events && !ndjson) {
    console.error('--events supports only: ndjson')
    process.exit(1)
  }
  const say = (line: string) => (ndjson ? console.error(line) : console.log(line))

  const perIterationCeiling = estimateCeilingUsd(DEFAULT_GUARDRAILS.maxTokens)
  say(`Provider: ${flags.provider} · build model: ${flags.model} · reflect model: ${flags['reflect-model'] ?? flags.model}`)
  say(flags['verify-cmd'] ? `Verify command (yours, never the model's): ${flags['verify-cmd']}` : 'Verify: auto-detected from the project after each build.')
  say(`Budget: up to ${maxIterations} iteration(s); per iteration up to ${DEFAULT_GUARDRAILS.maxToolTurns} tool turns / ${DEFAULT_GUARDRAILS.maxTokens} tokens (worst case ${formatUsd(perIterationCeiling)} each).`)
  say('Press Ctrl+C at any time to abort — the current iteration rolls back; completed iterations are kept.\n')

  const controller = new AbortController()
  process.on('SIGINT', () => {
    console.error('\nInterrupted — aborting…')
    controller.abort()
  })
  if (ndjson) {
    // The control channel for hosts that can't deliver signals portably (the
    // Tauri shell on every platform): a line saying "abort" on stdin triggers
    // the same clean abort path as Ctrl+C. Guarded — stdin isn't always a
    // normal, unref-able stream (piped/closed stdin), and a control-channel
    // convenience must never crash the whole run.
    try {
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', (chunk: string) => {
        if (chunk.split('\n').some((l) => l.trim() === 'abort')) {
          console.error('Abort requested over stdin…')
          controller.abort()
        }
      })
      process.stdin.unref?.()
    } catch {
      /* no stdin control channel available — SIGINT still works */
    }
  }

  // Autonomy (issue #39): default guided; autopilot needs the deliberate
  // --allow-autopilot, which the engine itself re-checks.
  const autonomy = (flags.autonomy as 'copilot' | 'guided' | 'autopilot' | undefined) ?? 'guided'
  if (!['copilot', 'guided', 'autopilot'].includes(autonomy)) {
    console.error('--autonomy must be one of: copilot, guided, autopilot')
    process.exit(1)
  }

  const verifyMode = (flags['verify-mode'] as 'local' | 'container' | undefined) ?? 'local'
  if (!['local', 'container'].includes(verifyMode)) {
    console.error('--verify-mode must be one of: local, container')
    process.exit(1)
  }

  // --mcp-server "<command> <args…>" (repeatable via ';;'): the user's own MCP
  // servers whose tools are offered to Build. First token is the command.
  const mcpServers = (flags['mcp-server'] ?? '')
    .split(';;')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((spec) => {
      const [command, ...args] = spec.split(/\s+/)
      return { command, args }
    })

  let outcome: Awaited<ReturnType<typeof runLoop>>
  try {
    outcome = await runLoop({
      workspacePath,
      intent,
      providerId: flags.provider,
      model: flags.model,
      reflectModel: flags['reflect-model'],
      verifyCommand: flags['verify-cmd'],
      consentToRun: true,
      maxIterations,
      autonomy,
      allowAutopilot: flags['allow-autopilot'] === 'true',
      verifyMode,
      verifyImage: flags['verify-image'],
      verifyAllowNetwork: flags['verify-network'] === 'true',
      mcpServers,
      initIfNeeded: flags['init-if-needed'] === 'true',
      verifyTimeoutMs: flags['verify-timeout-ms'] ? Number(flags['verify-timeout-ms']) : undefined,
      signal: controller.signal,
      onEvent: ndjson ? (e) => console.log(JSON.stringify({ type: 'event', ...e })) : undefined,
      onMemo: ndjson ? (m) => console.log(JSON.stringify({ type: 'memo', ...m })) : undefined,
      onLog: say,
    })
  } catch (err) {
    // Setup failures (not a git repo, missing API key, unknown provider/model)
    // reach here. In ndjson mode, hand the shell a clean, structured error it
    // can show the user — never a bare process crash it has to guess at.
    const message = err instanceof Error ? err.message : String(err)
    if (ndjson) {
      console.log(JSON.stringify({ type: 'error', message }))
      process.exitCode = 1
      return
    }
    throw err
  }

  if (ndjson) {
    // The terminal line: everything the shell needs to render the run's end
    // state, including the diff for the review surface.
    console.log(JSON.stringify({ type: 'outcome', ...outcome }))
    if (outcome.status !== 'converged') process.exitCode = 1
    return
  }

  console.log('--- flight recorder ---')
  for (const e of outcome.events) console.log(`  ${String(Math.round(e.t / 1000)).padStart(3)}s  ${e.kind.padEnd(9)} ${e.label}`)
  for (const m of outcome.memos) console.log(`\nMemo #${m.id} (after iteration ${m.iteration}):\n  finding: ${m.finding}\n  directive: ${m.directive}`)

  if (outcome.status === 'converged') {
    console.log(`\nConverged in ${outcome.iterations} iteration(s) · ${formatUsd(outcome.totalCostUsd)} actual · branch "${outcome.branchName}".`)
    console.log('\n--- diff since branch point — review before merging ---')
    console.log(outcome.diff)
  } else if (outcome.status === 'exhausted') {
    console.log(`\nBudget spent: ${outcome.iterations} iteration(s) without convergence · ${formatUsd(outcome.totalCostUsd)} actual.`)
    console.log(`Last verify: exit ${outcome.finalVerify.exitCode}${outcome.finalVerify.timedOut ? ' (timed out)' : ''}.`)
    console.log(`The attempts are preserved on branch "${outcome.branchName}" for inspection.`)
    process.exitCode = 1
  } else {
    console.log(`\n${outcome.status === 'aborted' ? 'Aborted.' : 'Stopped — guardrail tripped.'} ${outcome.message}`)
    console.log(`${outcome.iterationsCompleted} completed iteration(s) kept on branch "${outcome.branchName}" · ${formatUsd(outcome.totalCostUsd)} actual.`)
    process.exitCode = 1
  }
}

/**
 * The desktop shell's handshake target. Bumped by hand when the sidecar
 * protocol changes shape — the shell refuses to drive an engine whose major
 * version it doesn't recognize (wired with the real IPC in the next step).
 */
const ENGINE_VERSION = '2.0.0-beta.3'

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)

  switch (command) {
    case 'version': {
      console.log(JSON.stringify({ engine: ENGINE_VERSION, node: process.version }))
      return
    }
    case 'apply-test-edit': {
      if (!rest[0]) usage()
      const result = applyTestEdit(rest[0])
      if (result.bootstrapped) console.log(`No repo at ${result.workspaceRoot} — materialized the Phase 0 toy fixture there.\n`)
      console.log(`Created shadow branch "${result.branchName}" from ${result.baseRef.slice(0, 8)}.`)
      console.log(`Committed iteration 1: ${result.commitSha.slice(0, 8)}`)
      console.log('\n--- diff since branch point ---')
      console.log(result.diff)
      return
    }
    case 'rollback': {
      if (!rest[0] || !rest[1]) usage()
      const result = rollbackCommand(rest[0], rest[1])
      console.log(`Rolled back ${result.workspaceRoot} to ${result.sha.slice(0, 8)}.`)
      return
    }
    case 'build': {
      const { positional, flags } = parseArgs(rest)
      await runBuild(positional, flags)
      return
    }
    case 'loop': {
      const { positional, flags } = parseArgs(rest)
      await runLoopCommand(positional, flags)
      return
    }
    case 'plan': {
      const { positional, flags } = parseArgs(rest)
      await runPlanCommand(positional, flags)
      return
    }
    case 'merge': {
      const { positional, flags } = parseArgs(rest)
      const [workspacePath, branchName] = positional
      if (!workspacePath || !branchName || !flags.into) usage()
      const result = mergeShadowBranch({
        workspaceRoot: workspacePath,
        branchName,
        targetBranch: flags.into,
        mode: flags.pr === 'true' ? 'pr' : 'merge',
      })
      if (result.status === 'merged') {
        console.log(`Merged "${branchName}" into "${result.targetBranch}" at ${result.sha.slice(0, 8)}${result.fastForward ? ' (fast-forward)' : ' (rebased, then fast-forward)'}.`)
      } else if (result.status === 'pr-created') {
        console.log(`Opened ${result.url} — review and merge it there.`)
      } else {
        console.error(`Refused: ${result.reason}`)
        process.exitCode = 1
      }
      return
    }
    default:
      usage()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
