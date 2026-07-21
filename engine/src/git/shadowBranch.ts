/**
 * The shadow-branch model from ROADMAP.md: launching a real loop creates a
 * dedicated branch from HEAD; each iteration commits to it before Verify runs;
 * the user's actual branch is never touched until an explicit Merge. Every
 * operation shells out to `git` via execFileSync with an argv array — never a
 * shell string — so there is no command-injection surface here.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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

/** Like `git`, but returns null instead of throwing — for existence probes. */
function tryGit(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/**
 * "New project from scratch" (dogfooding request): make `repoRoot` loop-ready
 * even when the user points at a plain, empty folder, instead of refusing it.
 * Initializes git if there's no repo; gives it a commit identity if the machine
 * has none configured (so the loop's commits never fail); and lays down an empty
 * initial commit if the repo has no HEAD yet — which gives the shadow branch a
 * clean *empty base* to diff against, so the review shows the whole project the
 * loop builds. Idempotent: on an existing repo with history it does nothing and
 * never overrides an identity the user already set. Only called when the caller
 * explicitly opts in. Returns the steps it actually took, for the flight recorder.
 */
export function ensureInitialized(repoRoot: string): string[] {
  const steps: string[] = []
  if (!existsSync(join(repoRoot, '.git'))) {
    git(repoRoot, ['init'])
    steps.push('initialized an empty git repository')
  }
  if (!tryGit(repoRoot, ['config', 'user.email'])) {
    git(repoRoot, ['config', 'user.email', 'noreply@sutra.local'])
    git(repoRoot, ['config', 'user.name', 'Sutra'])
  }
  if (!tryGit(repoRoot, ['rev-parse', 'HEAD'])) {
    git(repoRoot, ['commit', '--allow-empty', '-m', 'Initial commit'])
    steps.push('created an empty initial commit')
  }
  return steps
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
