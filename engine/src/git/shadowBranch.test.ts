import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { makeToyRepo } from '../../evals/fixtures/makeToyRepo'
import { createFsTools } from '../tools/fs'
import { commitIteration, createShadowBranch, diffSinceBranchPoint, rollbackTo } from './shadowBranch'

function withToyRepo(fn: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'sutra-git-'))
  makeToyRepo(root)
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('creates a shadow branch recording its base ref', () => {
  withToyRepo((root) => {
    const branch = createShadowBranch(root, 'sutra/test-1')
    assert.equal(branch.branchName, 'sutra/test-1')
    assert.match(branch.baseRef, /^[0-9a-f]{40}$/)
  })
})

test('commits an iteration and the edit is real on disk', () => {
  withToyRepo((root) => {
    const branch = createShadowBranch(root, 'sutra/test-2')
    createFsTools(root).editFile('src/greet.ts', { oldString: '// TODO: implement', newString: '// done' })
    const sha = commitIteration(branch, 1, 'test edit')
    assert.match(sha, /^[0-9a-f]{40}$/)
    assert.match(readFileSync(join(root, 'src', 'greet.ts'), 'utf8'), /\/\/ done/)
  })
})

test('a second iteration with no changes is a safe no-op, not an empty commit', () => {
  withToyRepo((root) => {
    const branch = createShadowBranch(root, 'sutra/test-3')
    const shaBefore = commitIteration(branch, 1, 'nothing changed')
    const shaAfter = commitIteration(branch, 2, 'still nothing')
    assert.equal(shaBefore, shaAfter)
  })
})

test('rolls back to the branch point, discarding the committed iteration', () => {
  withToyRepo((root) => {
    const branch = createShadowBranch(root, 'sutra/test-4')
    createFsTools(root).editFile('src/greet.ts', { oldString: '// TODO: implement', newString: '// done' })
    commitIteration(branch, 1, 'test edit')
    rollbackTo(root, branch.baseRef)
    assert.match(readFileSync(join(root, 'src', 'greet.ts'), 'utf8'), /TODO: implement/)
  })
})

test('diff-since-branch-point reflects the committed iteration', () => {
  withToyRepo((root) => {
    const branch = createShadowBranch(root, 'sutra/test-5')
    createFsTools(root).editFile('src/greet.ts', { oldString: '// TODO: implement', newString: '// done' })
    commitIteration(branch, 1, 'test edit')
    const diff = diffSinceBranchPoint(branch)
    assert.match(diff, /-\s*\/\/ TODO: implement/)
    assert.match(diff, /\+\s*\/\/ done/)
  })
})

test('the original branch is untouched by a shadow-branch run', () => {
  withToyRepo((root) => {
    const branch = createShadowBranch(root, 'sutra/test-6')
    createFsTools(root).editFile('src/greet.ts', { oldString: '// TODO: implement', newString: '// done' })
    commitIteration(branch, 1, 'test edit')
    const onMain = readFileSync(join(root, 'src', 'greet.ts'), 'utf8')
    // We're still checked out on the shadow branch after committing — switch back
    // to confirm main never received the edit.
    execFileSync('git', ['checkout', 'main'], { cwd: root, stdio: 'ignore' })
    const mainContent = readFileSync(join(root, 'src', 'greet.ts'), 'utf8')
    assert.match(mainContent, /TODO: implement/)
    assert.notEqual(onMain, mainContent)
  })
})
