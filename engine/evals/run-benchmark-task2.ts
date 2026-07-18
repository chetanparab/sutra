/**
 * Runs Phase 2's benchmark — the full real loop (Build → real Verify →
 * Reflect → iterate) — against a REAL provider with a REAL API key.
 *
 * NOT part of `npm test` and NEVER run in CI, for the same reasons as
 * run-benchmark.ts: paid, flaky, real-model calls don't belong in a
 * regression suite. Manual, occasional, human-reviewed.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npm run eval:task2 -- --provider anthropic --model claude-...
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { formatUsd } from '../src/build/costEstimate'
import { parseArgs } from '../src/cliArgs'
import { runLoop } from '../src/loop/runLoop'
import { makeTask2Fixture, TASK_2 } from './tasks/task2FixAverage'

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2))
  if (!flags.provider || !flags.model) {
    console.error('Usage: npm run eval:task2 -- --provider <anthropic|openai-compat> --model <model-id>')
    process.exit(1)
  }

  const root = mkdtempSync(join(tmpdir(), 'sutra-eval-task2-'))
  makeTask2Fixture(root)

  console.log(`Task: ${TASK_2.id}`)
  console.log(`Intent: ${TASK_2.intent}`)
  console.log(`Verify command: ${TASK_2.verifyCommand} (a real execution — this is the point)\n`)

  try {
    const outcome = await runLoop({
      workspacePath: root,
      intent: TASK_2.intent,
      providerId: flags.provider,
      model: flags.model,
      verifyCommand: TASK_2.verifyCommand,
      consentToRun: true, // the fixture is generated in a temp dir by this script — consent is inherent to running it
      maxIterations: 3,
    })

    console.log('--- flight recorder ---')
    for (const e of outcome.events) console.log(`  ${String(Math.round(e.t / 1000)).padStart(3)}s  ${e.kind.padEnd(9)} ${e.label}`)
    for (const m of outcome.memos) console.log(`\nMemo #${m.id}: ${m.finding} → ${m.directive}`)

    if (outcome.status === 'converged') {
      console.log(`\nConverged in ${outcome.iterations} iteration(s) · ${formatUsd(outcome.totalCostUsd)}.`)
      console.log('\n--- final diff — review it yourself ---')
      console.log(outcome.diff)
    } else {
      console.log(`\nDid not converge: ${outcome.status}.`)
      process.exitCode = 1
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
