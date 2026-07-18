/**
 * Real Merge (ROADMAP.md Phase 3, issue #26): land a finished shadow branch in
 * the user's branch — fast-forward when possible, rebase-then-fast-forward
 * when the target moved on, or hand the branch to `gh pr create` when the
 * repo works PR-first.
 *
 * The frozen invariant this module serves: **merge is human-gated, never
 * automatic.** Nothing in the engine calls this; it runs only when the user
 * clicks "Merge to main" (or invokes the CLI subcommand themselves). And it
 * never forces anything: a dirty worktree or a conflicted rebase is a typed
 * refusal explaining what to do, not a `--force` and not a throw — refusals
 * are outcomes the UI renders, not crashes.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { git } from '../git/shadowBranch'

export interface MergeParams {
  workspaceRoot: string
  /** The shadow branch to land (e.g. "sutra/loop-…"). */
  branchName: string
  /** The branch to land it in (the branch the loop was launched from). */
  targetBranch: string
  /** 'merge' lands locally; 'pr' pushes and opens a GitHub PR via gh. */
  mode?: 'merge' | 'pr'
  /** PR title when mode is 'pr'; defaults to the shadow branch's last commit subject. */
  prTitle?: string
  /**
   * Command runner, injectable for tests. Only the 'pr' path uses it (push +
   * gh) — local merges always run real git against the fixture repos.
   */
  execImpl?: (cmd: string, args: string[], cwd: string) => string
}

export type MergeResult =
  | { status: 'merged'; targetBranch: string; sha: string; fastForward: boolean }
  | { status: 'pr-created'; url: string }
  | { status: 'refused'; reason: string }

function defaultExec(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export function mergeShadowBranch(params: MergeParams): MergeResult {
  const root = resolve(params.workspaceRoot)
  if (!existsSync(root)) throw new Error(`No repo at ${root}.`)
  const exec = params.execImpl ?? defaultExec

  // Preconditions — each failure is a refusal with the fix spelled out.
  for (const branch of [params.branchName, params.targetBranch]) {
    try {
      git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
    } catch {
      return { status: 'refused', reason: `Branch "${branch}" does not exist in ${root}.` }
    }
  }
  if (git(root, ['status', '--porcelain']) !== '') {
    return {
      status: 'refused',
      reason: 'The worktree has uncommitted changes. Commit or stash them first — merging over a dirty worktree risks mixing your edits into the loop\'s.',
    }
  }

  if (params.mode === 'pr') return createPr(root, params, exec)

  const originalBranch = currentBranch(root)
  git(root, ['checkout', params.targetBranch])
  try {
    // Happy path: the target hasn't moved since the loop branched off.
    try {
      git(root, ['merge', '--ff-only', params.branchName])
      return { status: 'merged', targetBranch: params.targetBranch, sha: git(root, ['rev-parse', 'HEAD']), fastForward: true }
    } catch {
      /* fall through to rebase */
    }

    // The target moved on. Replay the shadow branch on top of it — and if
    // that hits conflicts, abort cleanly and refuse; conflict resolution is
    // the human's call, never something to force through.
    try {
      git(root, ['rebase', params.targetBranch, params.branchName])
    } catch {
      try {
        git(root, ['rebase', '--abort'])
      } catch {
        /* no rebase in progress to abort */
      }
      git(root, ['checkout', originalBranch])
      return {
        status: 'refused',
        reason: `"${params.targetBranch}" has new commits that conflict with the loop's changes. Rebase "${params.branchName}" manually and resolve the conflicts, then merge again.`,
      }
    }
    git(root, ['checkout', params.targetBranch])
    git(root, ['merge', '--ff-only', params.branchName])
    return { status: 'merged', targetBranch: params.targetBranch, sha: git(root, ['rev-parse', 'HEAD']), fastForward: false }
  } catch (err) {
    // Whatever went sideways, never leave the user stranded on a branch they
    // didn't choose.
    try {
      git(root, ['checkout', originalBranch])
    } catch {
      /* keep the original error */
    }
    throw err
  }
}

function currentBranch(root: string): string {
  return git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
}

function createPr(root: string, params: MergeParams, exec: MergeParams['execImpl'] & {}): MergeResult {
  try {
    git(root, ['remote', 'get-url', 'origin'])
  } catch {
    return { status: 'refused', reason: 'No "origin" remote — a PR needs somewhere to push. Use local merge instead.' }
  }
  try {
    exec('gh', ['--version'], root)
  } catch {
    return { status: 'refused', reason: 'The gh CLI is not available. Install it (https://cli.github.com) or use local merge.' }
  }

  const title = params.prTitle ?? git(root, ['log', '-1', '--format=%s', params.branchName])
  exec('git', ['push', '-u', 'origin', params.branchName], root)
  const url = exec(
    'gh',
    ['pr', 'create', '--head', params.branchName, '--base', params.targetBranch, '--title', title, '--body', 'Opened from a Sutra loop run — review the diff before merging.'],
    root,
  )
  return { status: 'pr-created', url: url.split('\n').at(-1) ?? url }
}
