/**
 * The three fs tools Phase 1's tool-use loop will call: read_file, list_dir,
 * edit_file. Every call is routed through resolveInWorkspace — no tool here ever
 * touches a path outside the workspace root. See ROADMAP.md, Phase 0.
 */
import { closeSync, constants as fsConstants, openSync, readdirSync, readFileSync, statSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import type { StructuredEdit } from '../../../src/contracts/agent'
import { resolveInWorkspace } from './workspace'

export class EditMatchError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly oldString: string,
    public readonly matchCount: number,
  ) {
    super(message)
    this.name = 'EditMatchError'
  }
}

export interface DirEntry {
  name: string
  type: 'file' | 'dir'
}

export interface FsTools {
  readFile(relPath: string): string
  listDir(relPath?: string): DirEntry[]
  /** Exact-match replace — throws EditMatchError if oldString isn't found or isn't unique. */
  editFile(relPath: string, edit: StructuredEdit): void
}

/**
 * Opens `abs` with O_NOFOLLOW and runs `fn` against the resulting fd, always
 * closing it. resolveInWorkspace already checks the target doesn't escape the
 * workspace via a symlink — but that's a check against a path *string*, and
 * time can pass between that check and this open (in principle, another
 * process could swap the file for a symlink in between: a classic
 * TOCTOU/symlink-swap race). O_NOFOLLOW closes that gap at the point of
 * actual I/O, which a path check alone cannot: if the final component is a
 * symlink by the time we actually open it, this throws instead of following it.
 */
function withNoFollowFd<T>(abs: string, flags: number, fn: (fd: number) => T): T {
  const fd = openSync(abs, flags)
  try {
    return fn(fd)
  } finally {
    closeSync(fd)
  }
}

export function createFsTools(workspaceRoot: string): FsTools {
  return {
    readFile(relPath) {
      const abs = resolveInWorkspace(workspaceRoot, relPath)
      return withNoFollowFd(abs, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW, (fd) => readFileSync(fd, 'utf8'))
    },

    listDir(relPath = '.') {
      const abs = resolveInWorkspace(workspaceRoot, relPath)
      return readdirSync(abs).map((name) => ({
        name,
        type: statSync(join(abs, name)).isDirectory() ? ('dir' as const) : ('file' as const),
      }))
    },

    editFile(relPath, { oldString, newString }) {
      const abs = resolveInWorkspace(workspaceRoot, relPath)
      const content = withNoFollowFd(abs, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW, (fd) => readFileSync(fd, 'utf8'))
      const matchCount = content.split(oldString).length - 1

      if (matchCount === 0) {
        throw new EditMatchError(`No match for the given oldString in "${relPath}".`, relPath, oldString, 0)
      }
      if (matchCount > 1) {
        throw new EditMatchError(
          `oldString matches ${matchCount} times in "${relPath}" — it must be unique. Add more surrounding context.`,
          relPath,
          oldString,
          matchCount,
        )
      }

      const newContent = content.replace(oldString, newString)
      withNoFollowFd(abs, fsConstants.O_WRONLY | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW, (fd) => writeSync(fd, newContent, 0, 'utf8'))
    },
  }
}
