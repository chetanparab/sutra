/**
 * Local merges run REAL git against throwaway fixture repos — the ff, the
 * rebase, the conflict refusal are all genuine git behavior, not mocks. Only
 * the 'pr' path (push + gh, which needs a network) uses the injectable exec.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { mergeShadowBranch } from './merge'

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'sutra-merge-'))
  const g = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  g(['init', '--initial-branch=main'])
  g(['config', 'user.email', 't@t.local'])
  g(['config', 'user.name', 'T'])
  writeFileSync(join(root, 'a.txt'), 'base\n')
  g(['add', '-A'])
  g(['commit', '-m', 'base'])
  return root
}

function gitIn(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function withRepo(fn: (root: string) => void) {
  const root = makeRepo()
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('fast-forwards when the target has not moved', () => {
  withRepo((root) => {
    gitIn(root, ['checkout', '-b', 'sutra/loop-1'])
    writeFileSync(join(root, 'a.txt'), 'loop change\n')
    gitIn(root, ['commit', '-am', '[iteration 1] change'])
    gitIn(root, ['checkout', 'main'])

    const result = mergeShadowBranch({ workspaceRoot: root, branchName: 'sutra/loop-1', targetBranch: 'main' })
    assert.equal(result.status, 'merged')
    if (result.status !== 'merged') return
    assert.equal(result.fastForward, true)
    assert.equal(gitIn(root, ['log', '-1', '--format=%s']), '[iteration 1] change')
    assert.equal(gitIn(root, ['rev-parse', 'main']), result.sha)
  })
})

test('rebases then fast-forwards when the target moved on without conflict', () => {
  withRepo((root) => {
    gitIn(root, ['checkout', '-b', 'sutra/loop-1'])
    writeFileSync(join(root, 'loop.txt'), 'loop file\n')
    gitIn(root, ['add', '-A'])
    gitIn(root, ['commit', '-m', '[iteration 1] add loop file'])
    // main moves on with a NON-conflicting change
    gitIn(root, ['checkout', 'main'])
    writeFileSync(join(root, 'other.txt'), 'unrelated\n')
    gitIn(root, ['add', '-A'])
    gitIn(root, ['commit', '-m', 'main moved on'])

    const result = mergeShadowBranch({ workspaceRoot: root, branchName: 'sutra/loop-1', targetBranch: 'main' })
    assert.equal(result.status, 'merged')
    if (result.status !== 'merged') return
    assert.equal(result.fastForward, false)
    // linear history: loop commit on top of main's new commit
    const log = gitIn(root, ['log', '--format=%s', '-3'])
    assert.deepEqual(log.split('\n'), ['[iteration 1] add loop file', 'main moved on', 'base'])
  })
})

test('refuses cleanly on a conflicted rebase, leaving the repo usable', () => {
  withRepo((root) => {
    gitIn(root, ['checkout', '-b', 'sutra/loop-1'])
    writeFileSync(join(root, 'a.txt'), 'loop version\n')
    gitIn(root, ['commit', '-am', '[iteration 1] conflicting change'])
    // main changes the SAME line
    gitIn(root, ['checkout', 'main'])
    writeFileSync(join(root, 'a.txt'), 'main version\n')
    gitIn(root, ['commit', '-am', 'main conflicting'])

    const result = mergeShadowBranch({ workspaceRoot: root, branchName: 'sutra/loop-1', targetBranch: 'main' })
    assert.equal(result.status, 'refused')
    if (result.status !== 'refused') return
    assert.match(result.reason, /conflict/)
    // no rebase left in progress, worktree clean, back on main
    assert.equal(gitIn(root, ['status', '--porcelain']), '')
    assert.equal(gitIn(root, ['rev-parse', '--abbrev-ref', 'HEAD']), 'main')
    // and the shadow branch still exists, untouched for manual resolution
    assert.equal(gitIn(root, ['log', '-1', '--format=%s', 'sutra/loop-1']), '[iteration 1] conflicting change')
  })
})

test('refuses on a dirty worktree without touching anything', () => {
  withRepo((root) => {
    gitIn(root, ['checkout', '-b', 'sutra/loop-1'])
    writeFileSync(join(root, 'b.txt'), 'committed\n')
    gitIn(root, ['add', '-A'])
    gitIn(root, ['commit', '-m', '[iteration 1] x'])
    gitIn(root, ['checkout', 'main'])
    writeFileSync(join(root, 'a.txt'), 'uncommitted local edit\n')

    const result = mergeShadowBranch({ workspaceRoot: root, branchName: 'sutra/loop-1', targetBranch: 'main' })
    assert.equal(result.status, 'refused')
    if (result.status !== 'refused') return
    assert.match(result.reason, /uncommitted changes/)
    // the local edit is untouched
    assert.match(gitIn(root, ['status', '--porcelain']), /a\.txt/)
  })
})

test('refuses when a named branch does not exist', () => {
  withRepo((root) => {
    const result = mergeShadowBranch({ workspaceRoot: root, branchName: 'sutra/nope', targetBranch: 'main' })
    assert.equal(result.status, 'refused')
    if (result.status !== 'refused') return
    assert.match(result.reason, /does not exist/)
  })
})

test('pr mode refuses without an origin remote', () => {
  withRepo((root) => {
    gitIn(root, ['checkout', '-b', 'sutra/loop-1'])
    writeFileSync(join(root, 'b.txt'), 'x\n')
    gitIn(root, ['add', '-A'])
    gitIn(root, ['commit', '-m', '[iteration 1] x'])
    gitIn(root, ['checkout', 'main'])

    const result = mergeShadowBranch({ workspaceRoot: root, branchName: 'sutra/loop-1', targetBranch: 'main', mode: 'pr' })
    assert.equal(result.status, 'refused')
    if (result.status !== 'refused') return
    assert.match(result.reason, /No "origin" remote/)
  })
})

test('pr mode pushes and opens the PR via the injected exec', () => {
  withRepo((root) => {
    gitIn(root, ['checkout', '-b', 'sutra/loop-1'])
    writeFileSync(join(root, 'b.txt'), 'x\n')
    gitIn(root, ['add', '-A'])
    gitIn(root, ['commit', '-m', '[iteration 1] the change'])
    gitIn(root, ['checkout', 'main'])
    gitIn(root, ['remote', 'add', 'origin', 'https://example.invalid/repo.git'])

    const calls: string[][] = []
    const result = mergeShadowBranch({
      workspaceRoot: root,
      branchName: 'sutra/loop-1',
      targetBranch: 'main',
      mode: 'pr',
      execImpl: (cmd, args) => {
        calls.push([cmd, ...args])
        if (cmd === 'gh' && args[0] === 'pr') return 'https://github.com/x/y/pull/1'
        return ''
      },
    })

    assert.equal(result.status, 'pr-created')
    if (result.status !== 'pr-created') return
    assert.equal(result.url, 'https://github.com/x/y/pull/1')
    // pushed the branch, then opened the PR with the branch's own subject as title
    assert.deepEqual(calls[1], ['git', 'push', '-u', 'origin', 'sutra/loop-1'])
    const prCall = calls[2]
    assert.equal(prCall[0], 'gh')
    assert.ok(prCall.includes('[iteration 1] the change'))
    assert.ok(prCall.includes('--base') && prCall.includes('main'))
  })
})
