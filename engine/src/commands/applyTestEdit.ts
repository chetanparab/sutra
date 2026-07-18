/**
 * Phase 0's acceptance-criterion command (see ROADMAP.md): proves the fs tools +
 * shadow-branch git ops + CLI wiring all work together, deterministically, with
 * zero AI involved — the edit here is scripted, not model-authored. That's Phase
 * 1's job, once the tool-use loop exists.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { makeToyRepo } from '../../evals/fixtures/makeToyRepo'
import { commitIteration, createShadowBranch, diffSinceBranchPoint } from '../git/shadowBranch'
import { createFsTools } from '../tools/fs'

export interface ApplyTestEditResult {
  workspaceRoot: string
  branchName: string
  baseRef: string
  commitSha: string
  diff: string
  bootstrapped: boolean
}

export function applyTestEdit(workspacePath: string): ApplyTestEditResult {
  const workspaceRoot = resolve(workspacePath)
  const bootstrapped = !existsSync(workspaceRoot)
  if (bootstrapped) makeToyRepo(workspaceRoot)

  // Always branch from main — this command is repeatable against the same fixture
  // path, and must not stack on top of a previous run's shadow branch. The random
  // suffix avoids a name collision if two runs land in the same millisecond.
  const branchName = `sutra/test-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const branch = createShadowBranch(workspaceRoot, branchName, 'main')

  createFsTools(workspaceRoot).editFile('src/greet.ts', {
    oldString: '// TODO: implement',
    newString: '// implemented by sutra-engine (Phase 0 test edit)',
  })

  const commitSha = commitIteration(branch, 1, 'Phase 0 plumbing test edit')
  const diff = diffSinceBranchPoint(branch)

  return { workspaceRoot, branchName: branch.branchName, baseRef: branch.baseRef, commitSha, diff, bootstrapped }
}
