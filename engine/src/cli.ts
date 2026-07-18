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

function usage(): never {
  console.error(`sutra-engine — Phase 0/1 CLI (see ROADMAP.md)

Usage:
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

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)

  switch (command) {
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
    default:
      usage()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
