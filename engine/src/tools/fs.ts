/**
 * The three fs tools Phase 1's tool-use loop will call: read_file, list_dir,
 * edit_file. Every call is routed through resolveInWorkspace — no tool here ever
 * touches a path outside the workspace root. See ROADMAP.md, Phase 0.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
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

export function createFsTools(workspaceRoot: string): FsTools {
  return {
    readFile(relPath) {
      return readFileSync(resolveInWorkspace(workspaceRoot, relPath), 'utf8')
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
      const content = readFileSync(abs, 'utf8')
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

      writeFileSync(abs, content.replace(oldString, newString), 'utf8')
    },
  }
}
