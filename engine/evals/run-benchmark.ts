/**
 * Runs Phase 1's benchmark task against a REAL provider, with a REAL API key.
 *
 * NOT part of `npm test` and NEVER run in CI on purpose: hitting a real paid
 * API on every push is flaky, slow, and costs money — that's not what unit
 * tests are for. This is a human-in-the-loop check, run manually and
 * occasionally, with your own key. See engine/README.md.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npm run eval:task1 -- --provider anthropic --model claude-...
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { estimateCeilingUsd, formatUsd } from '../src/build/costEstimate'
import { DEFAULT_GUARDRAILS } from '../src/build/guardrails'
import { build } from '../src/commands/build'
import { parseArgs } from '../src/cliArgs'
import { makeTask1Fixture, structuralCheck, TASK_1 } from './tasks/task1AddGuardClause'

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2))
  if (!flags.provider || !flags.model) {
    console.error('Usage: npm run eval:task1 -- --provider <anthropic|openai-compat> --model <model-id>')
    process.exit(1)
  }

  const root = mkdtempSync(join(tmpdir(), 'sutra-eval-task1-'))
  makeTask1Fixture(root)

  console.log(`Task: ${TASK_1.id}`)
  console.log(`Intent: ${TASK_1.intent}`)
  console.log(`Provider: ${flags.provider} · model: ${flags.model}`)
  console.log(`Worst-case budget: ${formatUsd(estimateCeilingUsd(DEFAULT_GUARDRAILS.maxTokens))}\n`)

  try {
    const outcome = await build({ workspacePath: root, intent: TASK_1.intent, providerId: flags.provider, model: flags.model })

    if (outcome.status !== 'converged') {
      console.log(`Did not converge: ${outcome.status} — ${outcome.message}`)
      process.exitCode = 1
      return
    }

    console.log(`Converged in ${outcome.turns} turn(s), ${formatUsd(outcome.actualCostUsd)} actual.\n`)
    console.log('--- diff — review this yourself, the check below is only a heuristic ---')
    console.log(outcome.diff)

    const finalContent = readFileSync(join(root, TASK_1.targetFile), 'utf8')
    const check = structuralCheck(finalContent)
    console.log(`\nHeuristic check: ${check.plausible ? 'looks plausible' : 'looks incomplete'}`)
    for (const note of check.notes) console.log(`  - ${note}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
