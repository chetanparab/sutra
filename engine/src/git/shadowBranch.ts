/**
 * The shadow-branch model from ROADMAP.md: launching a real loop creates a
 * dedicated branch from HEAD; each iteration commits to it before Verify runs;
 * the user's actual branch is never touched until an explicit Merge. Every
 * operation shells out to `git` via execFileSync with an argv array — never a
 * shell string — so there is no command-injection surface here.
 */
import { execFileSync } from 'node:child_process'

export class GitError extends Error {
  constructor(
    message: string,
    public readonly command: string[],
    public readonly stderr: string,
  ) {
    super(message)
    this.name = 'GitError'
  }
}

export function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (err) {
    const stderr = err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr: unknown }).stderr) : String(err)
    throw new GitError(`git ${args.join(' ')} failed: ${stderr.trim()}`, args, stderr)
  }
}

export interface ShadowBranch {
  readonly repoRoot: string
  readonly branchName: string
  /** The commit the branch was created from — never modified after creation. */
  readonly baseRef: string
}

/**
 * Create a dedicated branch for one loop run. If `baseBranch` is given, checks it
 * out first — a fresh loop launch should start from the user's actual branch, not
 * from wherever a *previous* shadow-branch run happened to leave the repo checked
 * out. Without it, branches from whatever is currently checked out (the caller's
 * responsibility to have that be correct).
 */
export function createShadowBranch(repoRoot: string, branchName: string, baseBranch?: string): ShadowBranch {
  if (baseBranch) git(repoRoot, ['checkout', baseBranch])
  const baseRef = git(repoRoot, ['rev-parse', 'HEAD'])
  git(repoRoot, ['checkout', '-b', branchName])
  return { repoRoot, branchName, baseRef }
}

/**
 * Stage everything and commit the current working tree as one iteration. An
 * iteration that made no changes is not an error — it's a valid (if unproductive)
 * outcome, and returns the current HEAD unchanged rather than an empty commit.
 */
export function commitIteration(shadow: ShadowBranch, iteration: number, message: string): string {
  git(shadow.repoRoot, ['add', '-A'])
  const status = git(shadow.repoRoot, ['status', '--porcelain'])
  if (status === '') return git(shadow.repoRoot, ['rev-parse', 'HEAD'])
  git(shadow.repoRoot, ['commit', '-m', `[iteration ${iteration}] ${message}`])
  return git(shadow.repoRoot, ['rev-parse', 'HEAD'])
}

/** Hard-reset the repo at `repoRoot` to `sha` — discarding any commits after it. */
export function rollbackTo(repoRoot: string, sha: string): void {
  git(repoRoot, ['reset', '--hard', sha])
}

/** Everything the shadow branch has changed relative to where it branched from. */
export function diffSinceBranchPoint(shadow: ShadowBranch): string {
  return git(shadow.repoRoot, ['diff', shadow.baseRef, 'HEAD'])
}
