/**
 * Phase 2's benchmark fixture (ROADMAP.md): a repo whose verify command is a
 * REAL test that actually fails — `node check.mjs` exits 1 because
 * `average([])` returns NaN where the check expects 0. Dependency-free on
 * purpose (no npm install), so verify runs instantly anywhere.
 *
 * The integration test drives this through the full loop with a scripted
 * provider whose first fix is deliberately subtly wrong (returns 1 for the
 * empty case instead of 0) — guaranteeing the deterministic 2-iteration
 * converge story the Phase 2 acceptance criterion asks for: fail → reflect →
 * fix → pass, with every verify a real command execution.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const TASK_2 = {
  id: 'fix-average-empty-case',
  intent: 'Fix average in src/stats.mjs so that `node check.mjs` passes. Currently average([]) returns NaN but the check expects 0.',
  verifyCommand: 'node check.mjs',
  targetFile: 'src/stats.mjs',
}

const STATS_MJS = `export function average(nums) {
  let total = 0
  for (const n of nums) total += n
  return total / nums.length
}
`

const CHECK_MJS = `import { average } from './src/stats.mjs'

const cases = [
  [[1, 2, 3], 2],
  [[], 0],
  [[5], 5],
]

let failed = 0
for (const [input, expected] of cases) {
  const got = average(input)
  if (!Object.is(got, expected)) {
    console.error(\`FAIL average(\${JSON.stringify(input)}): expected \${expected}, got \${got}\`)
    failed++
  }
}

if (failed > 0) {
  console.error(\`\${failed} case(s) failed\`)
  process.exit(1)
}
console.log('all cases passed')
`

export function makeTask2Fixture(targetPath: string): void {
  if (existsSync(targetPath)) rmSync(targetPath, { recursive: true, force: true })
  mkdirSync(join(targetPath, 'src'), { recursive: true })

  writeFileSync(join(targetPath, 'package.json'), '{ "name": "eval-task-2", "private": true, "type": "module" }\n')
  writeFileSync(join(targetPath, 'src', 'stats.mjs'), STATS_MJS)
  writeFileSync(join(targetPath, 'check.mjs'), CHECK_MJS)

  const git = (args: string[]) => execFileSync('git', args, { cwd: targetPath, stdio: 'ignore' })
  git(['init', '--initial-branch=main'])
  git(['config', 'user.email', 'engine@sutra.local'])
  git(['config', 'user.name', 'Sutra Engine Fixture'])
  git(['add', '-A'])
  git(['commit', '-m', 'Initial task-2 fixture (check.mjs fails: average([]) is NaN)'])
}
