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
import { commitIteration, createShadowBranch, diffSinceBranchPoint, rollbackTo } from '../git/shadowBranch'
import { reflect } from '../reflect/reflect'
import { createFsTools } from '../tools/fs'
import { outputTailForMemo, runVerifyCommand, type VerifyRunResult } from '../verify/runner'
import { resolveProvider } from '../commands/build'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

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
  /** The user's own verify command — never model-authored. */
  verifyCommand: string
  /** Explicit human consent to execute commands — see runner.ts. */
  consentToRun: true
  maxIterations?: number
  guardrails?: BuildGuardrails
  verifyTimeoutMs?: number
  signal?: AbortSignal
  baseBranch?: string
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
    throw new Error(`No repo at ${workspaceRoot}. The loop requires an existing repo — it does not bootstrap fixtures.`)
  }

  const provider = params.provider ?? resolveProvider(params.providerId ?? '')
  const maxIterations = params.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const startedAt = Date.now()

  const events: LoopEvent[] = []
  const memos: HermesMemo[] = []
  let inputTokens = 0
  let outputTokens = 0
  const record = (kind: LoopEvent['kind'], label: string, tone: LoopEvent['tone']) =>
    events.push({ t: Date.now() - startedAt, kind, label, tone })

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

      const intentForBuild = priorMemo
        ? `${params.intent}\n\nPrevious iteration's courier memo — apply this directive:\nFinding: ${priorMemo.finding}\nDirective: ${priorMemo.directive}`
        : params.intent

      const buildResult = await runBuildLoop({
        provider,
        model: params.model,
        intent: intentForBuild,
        tools: createFsTools(workspaceRoot),
        guardrails: params.guardrails,
        signal: params.signal,
      })
      inputTokens += buildResult.totalInputTokens
      outputTokens += buildResult.totalOutputTokens

      lastGoodSha = commitIteration(branch, iteration, params.intent.slice(0, 72))
      committedIterations = iteration

      const verify = runVerifyCommand({
        workspaceRoot,
        command: params.verifyCommand,
        consentToRun: params.consentToRun,
        timeoutMs: params.verifyTimeoutMs,
      })
      record('verify', `Verify · ${verify.passed ? 'passed' : verify.timedOut ? 'timed out' : `failed (exit ${verify.exitCode})`}`, verify.passed ? 'ok' : 'warn')

      if (verify.passed) {
        record('converge', `Converged · iteration ${iteration}`, 'ok')
        return {
          ...base,
          status: 'converged',
          iterations: iteration,
          headSha: lastGoodSha,
          diff: diffSinceBranchPoint(branch),
          finalVerify: verify,
          totalCostUsd: actualCostUsd(inputTokens, outputTokens),
        }
      }

      if (iteration < maxIterations) {
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
          totalCostUsd: actualCostUsd(inputTokens, outputTokens),
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
  }
}
