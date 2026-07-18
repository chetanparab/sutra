/**
 * sutra-engine — the Phase 0 plumbing CLI. Thin argv dispatch only; the actual
 * logic lives in ./commands so it's directly unit-testable without spawning a
 * subprocess. See ROADMAP.md.
 */
import { applyTestEdit } from './commands/applyTestEdit'
import { rollbackCommand } from './commands/rollback'

function usage(): never {
  console.error(`sutra-engine — Phase 0 plumbing CLI (see ROADMAP.md)

Usage:
  npm run engine -- apply-test-edit <workspace-path>
      Applies a scripted edit to src/greet.ts on a new shadow branch and commits
      it. If <workspace-path> doesn't exist, materializes the toy-repo fixture
      there first.

  npm run engine -- rollback <workspace-path> <sha>
      Hard-resets the repo at <workspace-path> to <sha>.
`)
  process.exit(1)
}

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'apply-test-edit': {
    if (!args[0]) usage()
    const result = applyTestEdit(args[0])
    if (result.bootstrapped) console.log(`No repo at ${result.workspaceRoot} — materialized the Phase 0 toy fixture there.\n`)
    console.log(`Created shadow branch "${result.branchName}" from ${result.baseRef.slice(0, 8)}.`)
    console.log(`Committed iteration 1: ${result.commitSha.slice(0, 8)}`)
    console.log('\n--- diff since branch point ---')
    console.log(result.diff)
    break
  }
  case 'rollback': {
    if (!args[0] || !args[1]) usage()
    const result = rollbackCommand(args[0], args[1])
    console.log(`Rolled back ${result.workspaceRoot} to ${result.sha.slice(0, 8)}.`)
    break
  }
  default:
    usage()
}
