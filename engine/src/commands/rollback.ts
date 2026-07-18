import { resolve } from 'node:path'
import { rollbackTo } from '../git/shadowBranch'

export function rollbackCommand(workspacePath: string, sha: string): { workspaceRoot: string; sha: string } {
  const workspaceRoot = resolve(workspacePath)
  rollbackTo(workspaceRoot, sha)
  return { workspaceRoot, sha }
}
