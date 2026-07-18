/**
 * Exposes the Phase 0 fs tools (read_file, list_dir, edit_file) as ToolDefs a
 * provider's tool-use can call, plus a dispatcher that executes a ToolCall
 * against a real FsTools instance — translating thrown errors (workspace
 * escape, ambiguous edit match) into a result the model can see and react to,
 * rather than crashing the whole build loop.
 */
import type { ToolCall, ToolDef } from '../../../src/contracts/llm'
import type { FsTools } from './fs'

export const FS_TOOL_DEFS: ToolDef[] = [
  {
    name: 'read_file',
    description: 'Read the full contents of a file in the workspace.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the workspace root.' } },
      required: ['path'],
    },
  },
  {
    name: 'list_dir',
    description: 'List the files and directories at a path in the workspace.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the workspace root. Omit for the root.' } },
    },
  },
  {
    name: 'edit_file',
    description:
      'Replace an exact, unique occurrence of oldString with newString in a file. oldString must appear exactly once — include enough surrounding context (a full line or more) to make it unique. If it matches zero or more than one time, the edit is rejected and you should read the file again and retry with a more specific oldString.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the workspace root.' },
        oldString: { type: 'string' },
        newString: { type: 'string' },
      },
      required: ['path', 'oldString', 'newString'],
    },
  },
]

export interface ToolExecutionResult {
  toolCallId: string
  content: string
  isError: boolean
}

function argAsString(args: Record<string, unknown>, key: string): string {
  const v = args[key]
  if (typeof v !== 'string') throw new Error(`Tool call is missing required string argument "${key}".`)
  return v
}

export function executeFsToolCall(tools: FsTools, call: ToolCall): ToolExecutionResult {
  try {
    switch (call.name) {
      case 'read_file':
        return { toolCallId: call.id, content: tools.readFile(argAsString(call.arguments, 'path')), isError: false }

      case 'list_dir': {
        const path = typeof call.arguments.path === 'string' ? call.arguments.path : undefined
        return { toolCallId: call.id, content: JSON.stringify(tools.listDir(path)), isError: false }
      }

      case 'edit_file': {
        const path = argAsString(call.arguments, 'path')
        tools.editFile(path, {
          oldString: argAsString(call.arguments, 'oldString'),
          newString: argAsString(call.arguments, 'newString'),
        })
        return { toolCallId: call.id, content: `Edited ${path}.`, isError: false }
      }

      default:
        return { toolCallId: call.id, content: `Unknown tool: "${call.name}".`, isError: true }
    }
  } catch (err) {
    return { toolCallId: call.id, content: err instanceof Error ? err.message : String(err), isError: true }
  }
}
