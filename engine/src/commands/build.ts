/**
 * The real Phase 1 command: an LLM you bring proposes a structured edit to a
 * real file in a real repo. Unlike apply-test-edit (Phase 0's scripted demo),
 * this does NOT self-bootstrap a fixture — it requires an existing repo,
 * because silently redirecting a real LLM call to a throwaway fixture would be
 * a confusing default for a command that costs real money.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { LlmProvider } from '../../../src/contracts/llm'
import { GuardrailViolation, type BuildGuardrails } from '../build/guardrails'
import { actualCostUsd } from '../build/costEstimate'
import { runBuildLoop } from '../build/toolLoop'
import { commitIteration, createShadowBranch, diffSinceBranchPoint, rollbackTo } from '../git/shadowBranch'
import { createAnthropicProvider } from '../providers/anthropic'
import { createOpenAiCompatProvider } from '../providers/openaiCompat'
import { createFsTools } from '../tools/fs'

export const KNOWN_PROVIDER_IDS = ['anthropic', 'openai-compat'] as const
export type KnownProviderId = (typeof KNOWN_PROVIDER_IDS)[number]

export function resolveProvider(id: string): LlmProvider {
  if (id === 'anthropic') return createAnthropicProvider()
  if (id === 'openai-compat') return createOpenAiCompatProvider()
  throw new Error(`Unknown provider "${id}". Known providers: ${KNOWN_PROVIDER_IDS.join(', ')}.`)
}

export interface BuildParams {
  workspacePath: string
  intent: string
  providerId: string
  model: string
  guardrails?: BuildGuardrails
  signal?: AbortSignal
  /** Inject a provider directly, bypassing resolveProvider(providerId) — for tests, so the orchestration is provable without a real network call. */
  provider?: LlmProvider
}

export type BuildOutcome =
  | {
      status: 'converged'
      workspaceRoot: string
      branchName: string
      commitSha: string
      diff: string
      finalText: string
      turns: number
      actualCostUsd: number
    }
  | { status: 'guardrail-violation'; workspaceRoot: string; branchName: string; message: string }
  | { status: 'aborted'; workspaceRoot: string; branchName: string; message: string }

export async function build(params: BuildParams): Promise<BuildOutcome> {
  const workspaceRoot = resolve(params.workspacePath)
  if (!existsSync(workspaceRoot)) {
    throw new Error(
      `No repo at ${workspaceRoot}. "build" requires an existing repo — it does not bootstrap a fixture (that's apply-test-edit's job, for Phase 0 demos only).`,
    )
  }

  const provider = params.provider ?? resolveProvider(params.providerId)
  const branchName = `sutra/build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const branch = createShadowBranch(workspaceRoot, branchName)

  try {
    const result = await runBuildLoop({
      provider,
      model: params.model,
      intent: params.intent,
      tools: createFsTools(workspaceRoot),
      guardrails: params.guardrails,
      signal: params.signal,
    })

    const commitSha = commitIteration(branch, 1, params.intent.slice(0, 72))
    const diff = diffSinceBranchPoint(branch)

    return {
      status: 'converged',
      workspaceRoot,
      branchName: branch.branchName,
      commitSha,
      diff,
      finalText: result.finalText,
      turns: result.turns,
      actualCostUsd: actualCostUsd(result.totalInputTokens, result.totalOutputTokens),
    }
  } catch (err) {
    // A single Build iteration hasn't committed anything yet — resetting to
    // the branch point discards any partially-applied edits, so an abort or a
    // tripped guardrail never leaves uncommitted changes on disk.
    rollbackTo(workspaceRoot, branch.baseRef)

    if (err instanceof GuardrailViolation) {
      return { status: 'guardrail-violation', workspaceRoot, branchName: branch.branchName, message: err.message }
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return { status: 'aborted', workspaceRoot, branchName: branch.branchName, message: 'Aborted — no changes were committed.' }
    }
    throw err
  }
}
