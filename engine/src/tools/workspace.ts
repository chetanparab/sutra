/**
 * The primary safety boundary for every fs tool the engine exposes: every path a
 * tool touches must resolve inside the chosen workspace root. See ROADMAP.md,
 * Phase 0 and the risk register's "workspace escape" row.
 */
import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export class WorkspaceEscapeError extends Error {
  constructor(
    public readonly attemptedPath: string,
    public readonly root: string,
  ) {
    super(`Path escapes the workspace root: "${attemptedPath}" is outside "${root}"`)
    this.name = 'WorkspaceEscapeError'
  }
}

function escapesRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

/**
 * Resolve `relPath` against `root` and verify the result stays inside `root`.
 * Rejects textual `../` traversal *and* symlinks that resolve outside the root —
 * checking the string alone isn't enough, since a symlink inside the workspace can
 * still point somewhere else on disk. Returns the resolved absolute path on success.
 */
export function resolveInWorkspace(root: string, relPath: string): string {
  const absRoot = resolve(root)
  const candidate = isAbsolute(relPath) ? resolve(relPath) : resolve(absRoot, relPath)

  if (escapesRoot(absRoot, candidate)) {
    throw new WorkspaceEscapeError(relPath, absRoot)
  }

  if (existsSync(candidate)) {
    const realCandidate = realpathSync(candidate)
    const realRoot = existsSync(absRoot) ? realpathSync(absRoot) : absRoot
    if (escapesRoot(realRoot, realCandidate)) {
      throw new WorkspaceEscapeError(relPath, absRoot)
    }
  }

  return candidate
}
