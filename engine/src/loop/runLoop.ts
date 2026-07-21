/**
 * The real iteration engine (ROADMAP.md Phase 2): Build → commit → Verify →
 * Reflect, again and again, until verification actually passes or the
 * iteration budget is spent. This is the loop the whole product is named for,
 * running for real: real files, real commits, real command execution, real
 * model calls — no scripted outcomes.
 *
 * Events and memos are recorded in the exact shapes the web UI's flight
 * recorder already renders (`LoopEvent`, `HermesMemo` from src/loop/types.ts —
 * type-only imports, so nothing browser-side leaks in here). When Phase 3
 * wires the engine into the desktop shell, a real run drops into the existing
 * surfaces unchanged.
 *
 * Git-state policy (the explicit, recorded decision ROADMAP.md requires):
 * every iteration's Build is committed to the shadow branch before Verify
 * runs; a failed iteration's commit is KEPT and the next Build stacks on top
 * of it (failures carry information); an abort or guardrail violation rolls
 * back only the current, uncommitted partial work — completed iterations stay.
 */
import type { HermesMemo, LoopEvent } from '../../../src/loop/types'
import type { LlmProvider } from '../../../src/contracts/llm'
import { actualCostUsd } from '../build/costEstimate'
import { GuardrailViolation, type BuildGuardrails } from '../build/guardrails'
import { runBuildLoop } from '../build/toolLoop'
import { commitIteration, createShadowBranch, diffSinceBranchPoint, ensureInitialized, rollbackTo } from '../git/shadowBranch'
import { reflect } from '../reflect/reflect'
import { createFsTools } from '../tools/fs'
import { outputTailForMemo, runVerifyCommand, type VerifyRunResult } from '../verify/runner'
import { isDockerAvailable, runVerifyInContainer } from '../verify/containerRunner'
import { detectVerifyCommand } from '../verify/detect'
import { connectMcpServers, type McpServerConfig, type McpToolset } from '../mcp/client'
import { resolveProvider } from '../commands/build'
import {
  CLAUDE_CODE_PROVIDER_ID,
  claudeCodeBuildPrompt,
  createClaudeCliProvider,
  resolveClaudeBinary,
  runClaudeCodeBuild,
} from '../agents/claudeCode'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DEFAULT_MAX_ITERATIONS = 3

export interface RunLoopParams {
  workspacePath: string
  intent: string
  providerId?: string
  /** Inject a provider directly (tests); otherwise providerId is resolved. */
  provider?: LlmProvider
  model: string
  /** Model for Reflect memos — defaults to `model`. Per-role routing, cheaply. */
  reflectModel?: string
  /**
   * The command that decides "done". Optional: when omitted, the engine
   * auto-detects it from the workspace after each Build (package.json test
   * script, cargo test, pytest, …) so the user never has to type it, and a
   * project the agent just scaffolded becomes verifiable on the next check.
   * A caller may still pass one explicitly to pin it. Never model-authored.
   */
  verifyCommand?: string
  /** Explicit human consent to execute commands — see runner.ts. */
  consentToRun: true
  maxIterations?: number
  guardrails?: BuildGuardrails
  verifyTimeoutMs?: number
  signal?: AbortSignal
  baseBranch?: string
  /**
   * "New project from scratch" (dogfooding request): when true, a plain or
   * empty target folder is made loop-ready — `git init` plus an empty initial
   * commit — instead of being refused for not being a git repo. The empty
   * initial commit gives the shadow branch a clean base, so the review diff is
   * the entire project the loop builds. No-op on a repo that already has history.
   * Off by default: an existing repo is never touched without the explicit flag.
   */
  initIfNeeded?: boolean
  /**
   * Where Verify runs (ROADMAP.md Phase 5, issue #10). 'local' executes on the
   * host (default). 'container' runs the command in a throwaway Docker
   * container with only the workspace mounted and the network off — isolating
   * a consented command on an untrusted repo. Falls back to local (with a
   * recorded note) if Docker isn't available.
   */
  verifyMode?: 'local' | 'container'
  /** Container image with the repo's toolchain (node:alpine, python:slim, …). Container mode only. */
  verifyImage?: string
  /** Allow the verify command network access in container mode. Off by default. */
  verifyAllowNetwork?: boolean
  /**
   * BYO-agent (issue #9): MCP servers whose tools are offered to the Build
   * phase's model alongside the built-in fs tools. Each is a program the user
   * chose to run (argv array, no shell). Connected once at the start of the
   * loop and reused across iterations.
   */
  mcpServers?: McpServerConfig[]
  /**
   * Autonomy for this real run (ROADMAP.md Phase 4, issue #39). Real mode
   * requires at least `guided` until there's a track record: `autopilot` is
   * refused unless `allowAutopilot` is explicitly set. Not the out-of-the-box
   * behavior — the opt-in is a deliberate act, enforced here at the engine
   * boundary (not just in the UI), so a caller can't quietly bypass it.
   * Defaults to `guided`.
   */
  autonomy?: 'copilot' | 'guided' | 'autopilot'
  /** Opt in to autopilot in real mode. Must be literally true; default refuses. */
  allowAutopilot?: boolean
  /**
   * Fired the moment each flight-recorder event is recorded — the live stream
   * the desktop shell forwards to the webview. The same objects land in the
   * outcome's `events` array; this is timing, not extra information.
   */
  onEvent?: (event: LoopEvent) => void
  /** Fired when a reflect memo is produced, before the next iteration builds. */
  onMemo?: (memo: HermesMemo) => void
  /**
   * Live narration lines (claude-code mode streams Build activity through
   * this). The CLI forwards them to stderr, which the desktop shell already
   * renders in the live engine-output panel.
   */
  onLog?: (line: string) => void
}

interface LoopRecordBase {
  branchName: string
  baseRef: string
  events: LoopEvent[]
  memos: HermesMemo[]
  totalCostUsd: number
}

export type LoopOutcome =
  | (LoopRecordBase & { status: 'converged'; iterations: number; headSha: string; diff: string; finalVerify: VerifyRunResult })
  | (LoopRecordBase & { status: 'exhausted'; iterations: number; headSha: string; diff: string; finalVerify: VerifyRunResult })
  | (LoopRecordBase & { status: 'guardrail-violation'; iterationsCompleted: number; message: string })
  | (LoopRecordBase & { status: 'aborted'; iterationsCompleted: number; message: string })

export async function runLoop(params: RunLoopParams): Promise<LoopOutcome> {
  const workspaceRoot = resolve(params.workspacePath)
  if (!existsSync(workspaceRoot)) {
    throw new Error(`No folder at ${workspaceRoot}.`)
  }
  // "New project from scratch" (opt-in): make a plain/empty folder loop-ready up
  // front, before the git guard, so pointing at an empty directory scaffolds a
  // project instead of being refused. Deferred-recorded — `record` isn't defined
  // until below — so the steps surface in the flight recorder once it is.
  const initSteps = params.initIfNeeded ? ensureInitialized(workspaceRoot) : []
  // The loop works on a git repo (shadow branch + commits). Check up front so
  // a common mistake — pointing at a plain folder — gets a clear message
  // instead of a cryptic git failure mid-run.
  if (!existsSync(join(workspaceRoot, '.git'))) {
    throw new Error(`"${workspaceRoot}" is not a git repository. Run \`git init\` in it (and make a first commit), then try again.`)
  }

  // Autopilot in real mode is opt-in, not default (issue #39). Refuse here at
  // the engine boundary so no caller — CLI, desktop, or a future one — can
  // reach it without the deliberate flag.
  if (params.autonomy === 'autopilot' && params.allowAutopilot !== true) {
    throw new Error(
      'Autopilot is not allowed in real mode by default. Real runs require at least "guided" until there is a track record. ' +
        'Pass allowAutopilot: true to override deliberately.',
    )
  }

  // claude-code mode (no API key): the locally signed-in Claude Code CLI is
  // the model. Build runs through the CLI itself; Reflect goes through a thin
  // single-turn provider so the memo logic is reused unchanged.
  const claudeMode = params.provider === undefined && params.providerId === CLAUDE_CODE_PROVIDER_ID
  const claudeCost = { usd: 0 }
  let claudeBin = ''
  if (claudeMode) {
    const bin = resolveClaudeBinary()
    if (!bin) {
      throw new Error(
        'Claude Code CLI not found on this machine. Install it (npm install -g @anthropic-ai/claude-code), run `claude` once to sign in — or pick a provider with an API key.',
      )
    }
    claudeBin = bin
  }
  const provider =
    params.provider ?? (claudeMode ? createClaudeCliProvider(claudeBin, workspaceRoot, claudeCost) : resolveProvider(params.providerId ?? ''))
  const maxIterations = params.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const startedAt = Date.now()

  const events: LoopEvent[] = []
  const memos: HermesMemo[] = []
  let inputTokens = 0
  let outputTokens = 0
  const record = (kind: LoopEvent['kind'], label: string, tone: LoopEvent['tone']) => {
    const event: LoopEvent = { t: Date.now() - startedAt, kind, label, tone }
    events.push(event)
    params.onEvent?.(event)
  }
  // Surface any "new project" setup now that the recorder exists.
  for (const step of initSteps) record('memo', `New project — ${step}`, 'muted')

  // Resolve where Verify runs once, up front (issue #10): container mode needs
  // a working Docker daemon; if it isn't there, fall back to local with a
  // recorded note rather than failing every iteration.
  let verifyMode = params.verifyMode ?? 'local'
  if (verifyMode === 'container' && !isDockerAvailable()) {
    verifyMode = 'local'
  }
  const runVerify = (command: string): VerifyRunResult =>
    verifyMode === 'container'
      ? runVerifyInContainer({
          workspaceRoot,
          command,
          consentToRun: params.consentToRun,
          image: params.verifyImage,
          allowNetwork: params.verifyAllowNetwork,
          timeoutMs: params.verifyTimeoutMs,
        })
      : runVerifyCommand({
          workspaceRoot,
          command,
          consentToRun: params.consentToRun,
          timeoutMs: params.verifyTimeoutMs,
        })

  // BYO-agent (issue #9): connect the user's MCP servers once and offer their
  // tools to every Build iteration. A server that fails to start is skipped
  // (recorded), not fatal. Closed in the finally.
  let mcp: McpToolset | undefined
  if (params.mcpServers && params.mcpServers.length > 0) {
    if (claudeMode) {
      // Claude Code manages its own tools; the engine-side MCP bridge only
      // feeds the provider tool-use path, which claude-code mode doesn't use.
      record('memo', 'MCP servers are skipped in Claude Code mode — configure them in Claude Code itself.', 'warn')
    } else {
      mcp = await connectMcpServers(params.mcpServers, (m) => record('memo', m, 'warn'))
      if (mcp.tools.length > 0) record('memo', `MCP: ${mcp.tools.length} tool(s) available to Build`, 'muted')
    }
  }

  const branchName = `sutra/loop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const branch = createShadowBranch(workspaceRoot, branchName, params.baseBranch)
  const base: LoopRecordBase = { branchName: branch.branchName, baseRef: branch.baseRef, events, memos, totalCostUsd: 0 }
  let lastGoodSha = branch.baseRef
  let committedIterations = 0
  let priorMemo: HermesMemo | undefined

  try {
    let iteration = 1
    for (; iteration <= maxIterations; iteration++) {
      record('iteration', `Iteration ${iteration}`, 'accent')
      // Phase markers exist for the live stream: the desktop UI shows an
      // indeterminate "running" state for the phase named by the latest
      // marker. The verify/memo/converge events that follow carry results.
      record('phase', 'Build', 'muted')

      const intentForBuild = priorMemo
        ? `${params.intent}\n\nPrevious iteration's courier memo — apply this directive:\nFinding: ${priorMemo.finding}\nDirective: ${priorMemo.directive}`
        : params.intent

      if (claudeMode) {
        const run = await runClaudeCodeBuild({
          bin: claudeBin,
          workspaceRoot,
          prompt: claudeCodeBuildPrompt(intentForBuild, params.verifyCommand),
          model: params.model,
          maxTurns: params.guardrails?.maxToolTurns,
          signal: params.signal,
          onLog: params.onLog,
        })
        claudeCost.usd += run.costUsd
        inputTokens += run.inputTokens
        outputTokens += run.outputTokens
      } else {
        const buildResult = await runBuildLoop({
          provider,
          model: params.model,
          intent: intentForBuild,
          tools: createFsTools(workspaceRoot),
          guardrails: params.guardrails,
          signal: params.signal,
          extraTools: mcp?.tools,
          dispatchExtraTool: mcp ? (call) => mcp!.callTool(call.name, call.arguments) : undefined,
        })
        inputTokens += buildResult.totalInputTokens
        outputTokens += buildResult.totalOutputTokens
      }

      lastGoodSha = commitIteration(branch, iteration, params.intent.slice(0, 72))
      committedIterations = iteration

      record('phase', verifyMode === 'container' ? 'Verify (container)' : 'Verify', 'muted')
      // Resolve the verify command NOW (after Build): a caller's explicit
      // command wins; otherwise auto-detect from the just-built workspace, so
      // the user never types one and a freshly-scaffolded project is checkable.
      const pinned = params.verifyCommand?.trim()
      const detected = pinned ? { command: pinned, reason: 'your command' } : detectVerifyCommand(workspaceRoot)
      if (!detected) {
        // Nothing to run: no explicit command, no recognizable toolchain. Don't
        // fake a green — the build stands, but say plainly it wasn't verified
        // and route the human to the diff.
        record('verify', 'Verify · no automatic check found — built, not verified', 'warn')
        record('converge', 'Built — review the diff (no automated verification)', 'ok')
        return {
          ...base,
          status: 'converged',
          iterations: iteration,
          headSha: lastGoodSha,
          diff: diffSinceBranchPoint(branch),
          finalVerify: {
            passed: false,
            exitCode: null,
            termSignal: null,
            stdout: '',
            stderr: 'No test or build command could be auto-detected, so Sutra built the change without an automated check. Review the diff.',
            durationMs: 0,
            timedOut: false,
          },
          totalCostUsd: claudeMode ? claudeCost.usd : actualCostUsd(inputTokens, outputTokens),
        }
      }
      params.onLog?.(`→ verify: ${detected.command}  (${detected.reason})`)
      const verify = runVerify(detected.command)
      record('verify', `Verify · ${detected.command} · ${verify.passed ? 'passed' : verify.timedOut ? 'timed out' : `failed (exit ${verify.exitCode})`}`, verify.passed ? 'ok' : 'warn')

      if (verify.passed) {
        record('converge', `Converged · iteration ${iteration}`, 'ok')
        return {
          ...base,
          status: 'converged',
          iterations: iteration,
          headSha: lastGoodSha,
          diff: diffSinceBranchPoint(branch),
          finalVerify: verify,
          totalCostUsd: claudeMode ? claudeCost.usd : actualCostUsd(inputTokens, outputTokens),
        }
      }

      if (iteration < maxIterations) {
        record('phase', 'Reflect', 'muted')
        const memoResult = await reflect({
          provider,
          model: params.reflectModel ?? params.model,
          intent: params.intent,
          iteration,
          verifyOutputTail: outputTailForMemo(verify),
          signal: params.signal,
        })
        inputTokens += memoResult.usage.inputTokens
        outputTokens += memoResult.usage.outputTokens

        priorMemo = {
          id: memos.length + 1,
          iteration,
          kind: 'reflect',
          title: `Memo #${memos.length + 1}`,
          finding: memoResult.finding,
          directive: memoResult.directive,
          routedTo: 'Build',
        }
        memos.push(priorMemo)
        params.onMemo?.(priorMemo)
        record('memo', `Hermes memo #${priorMemo.id}`, 'accent')
      } else {
        record('exhausted', `Budget spent · ${maxIterations} iteration${maxIterations === 1 ? '' : 's'}`, 'warn')
        return {
          ...base,
          status: 'exhausted',
          iterations: maxIterations,
          headSha: lastGoodSha,
          diff: diffSinceBranchPoint(branch),
          finalVerify: verify,
          totalCostUsd: claudeMode ? claudeCost.usd : actualCostUsd(inputTokens, outputTokens),
        }
      }
    }
    // Unreachable — every path inside the for returns or continues — but the
    // compiler can't prove it.
    throw new Error('runLoop exited its iteration loop without an outcome (bug).')
  } catch (err) {
    // Discard only the current iteration's uncommitted partial work; completed
    // iterations' commits are kept deliberately (see the policy note above).
    rollbackTo(workspaceRoot, lastGoodSha)
    const totalCostUsd = actualCostUsd(inputTokens, outputTokens)

    if (err instanceof GuardrailViolation) {
      record('exhausted', `Guardrail tripped · ${err.kind}`, 'warn')
      return { ...base, status: 'guardrail-violation', iterationsCompleted: committedIterations, message: err.message, totalCostUsd }
    }
    if (err instanceof Error && err.name === 'AbortError') {
      record('exhausted', 'Aborted by the user', 'warn')
      return { ...base, status: 'aborted', iterationsCompleted: committedIterations, message: 'Aborted — the current iteration was rolled back; completed iterations were kept.', totalCostUsd }
    }
    throw err
  } finally {
    mcp?.close()
  }
}
