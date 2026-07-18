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
 *
 * GitHub's automatic code scanning flags js/insecure-temporary-file on the
 * open() below. Investigated and dismissed as a false positive in the
 * Security tab, with the reasoning recorded there: its taint source is only
 * ever this module's own tests (mkdtempSync(tmpdir()) fixtures) — the
 * *secure*, randomly-named, exclusively-created pattern that query exists to
 * steer people toward, not away from — never real production usage. The
 * actual TOCTOU/symlink risk that query cares about is exactly what
 * O_NOFOLLOW closes here.
 */
function withNoFollowFd<T>(abs: string, flags: number, fn: (fd: number) => T): T {
  const fd = openSync(abs, flags)
  try {
    return fn(fd)
  } finally {
    closeSync(fd)
  }
}

/**
 * read_file output cap (Phase 4, issue #38): ~48k chars ≈ 12k tokens. A repo
 * with one giant generated file must not blow the whole context window in a
 * single tool result — the model gets the head of the file plus an explicit
 * marker saying what happened, so it can react (narrow the work, edit within
 * the shown portion) instead of silently drowning.
 */
export const READ_FILE_MAX_CHARS = 48_000

function truncateForContext(content: string, relPath: string): string {
  if (content.length <= READ_FILE_MAX_CHARS) return content
  return (
    content.slice(0, READ_FILE_MAX_CHARS) +
    `\n…[truncated by the engine: "${relPath}" is ${content.length} characters; the first ${READ_FILE_MAX_CHARS} are shown. ` +
    'Edits must use oldString text from the shown portion only. If the change belongs beyond this point, say so instead of guessing.]'
  )
}

/**
 * When an edit misses, hand the model the file's ACTUAL text nearest its
 * attempt (issue #38's "retry with the exact mismatch"): most misses are
 * whitespace/indentation drift or a stale read, and seeing the real bytes
 * beats a blind re-read round-trip.
 */
function nearestMismatchHint(content: string, oldString: string): string {
  const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
  const firstMeaningfulLine = oldString.split('\n').find((l) => l.trim() !== '')?.trim()
  if (!firstMeaningfulLine) return ''

  const lines = content.split('\n')
  const hitIndex = lines.findIndex((l) => collapse(l).includes(collapse(firstMeaningfulLine)))
  if (hitIndex === -1) return ''

  const region = lines.slice(Math.max(0, hitIndex - 1), hitIndex + Math.max(2, oldString.split('\n').length + 1)).join('\n')
  return ` The nearest matching region actually reads:\n${JSON.stringify(region)}\n(whitespace shown exactly — copy from this).`
}

export function createFsTools(workspaceRoot: string): FsTools {
  return {
    readFile(relPath) {
      const abs = resolveInWorkspace(workspaceRoot, relPath)
      const content = withNoFollowFd(abs, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW, (fd) => readFileSync(fd, 'utf8'))
      return truncateForContext(content, relPath)
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
        throw new EditMatchError(
          `No exact match for the given oldString in "${relPath}".${nearestMismatchHint(content, oldString)} Read the file and retry with its exact current text.`,
          relPath,
          oldString,
          0,
        )
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
