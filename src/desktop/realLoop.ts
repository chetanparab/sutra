/**
 * The webview side of the live-loop plumbing (ROADMAP.md Phase 3): starts a
 * real engine run through the Rust host, parses the NDJSON stream the host
 * forwards, and exposes the kill switch. Pure plumbing + types — the UI layer
 * that maps these onto LoopState comes with the real-mode surfaces.
 *
 * Protocol (one JSON object per `engine:line` event, from
 * `sutra-engine loop … --events ndjson`):
 *   {type:'event', t, kind, label, tone}   — flight-recorder event, live
 *   {type:'memo', id, iteration, …}        — a Hermes memo, live
 *   {type:'outcome', status, …}            — the terminal line, diff included
 */
import type { HermesMemo, LoopEvent } from '../loop/types'
import { isDesktop } from './engine'

export interface EngineOutcome {
  status: 'converged' | 'exhausted' | 'guardrail-violation' | 'aborted'
  branchName: string
  baseRef: string
  events: LoopEvent[]
  memos: HermesMemo[]
  totalCostUsd: number
  iterations?: number
  headSha?: string
  diff?: string
  message?: string
}

export type EngineStreamLine =
  | ({ type: 'event' } & LoopEvent)
  | ({ type: 'memo' } & HermesMemo)
  | ({ type: 'outcome' } & EngineOutcome)

/** Defensive parse: the stream is ours end-to-end, but a desktop app must not crash on a torn line. */
export function parseEngineLine(raw: string): EngineStreamLine | null {
  if (!raw.trim().startsWith('{')) return null
  try {
    const parsed = JSON.parse(raw) as { type?: unknown }
    if (parsed.type === 'event' || parsed.type === 'memo' || parsed.type === 'outcome') {
      return parsed as EngineStreamLine
    }
    return null
  } catch {
    return null
  }
}

export interface RealLoopArgs {
  workspacePath: string
  intent: string
  provider: string
  model: string
  /** The USER's verify command from the consent surface — never model-authored. */
  verifyCmd: string
  /** Must be true; the engine refuses otherwise. The consent checkbox sets it. */
  consentToRun: boolean
  maxIterations: number
  reflectModel?: string
}

export interface RealLoopHandlers {
  onEvent?: (event: LoopEvent) => void
  onMemo?: (memo: HermesMemo) => void
  onOutcome?: (outcome: EngineOutcome) => void
  /** Engine stderr narration — surfaced in the console dock, never parsed. */
  onLog?: (line: string) => void
  onExit?: (code: number | null) => void
}

export interface RealLoopHandle {
  /** The kill switch: clean abort (current iteration rolls back, completed ones stay). */
  abort: () => Promise<void>
  /** Stop listening. Does not stop the engine — call abort for that. */
  dispose: () => void
}

export async function startRealLoop(args: RealLoopArgs, handlers: RealLoopHandlers): Promise<RealLoopHandle> {
  if (!isDesktop()) throw new Error('Real loops run only in the desktop shell.')
  const { invoke } = await import('@tauri-apps/api/core')
  const { listen } = await import('@tauri-apps/api/event')

  const unlisteners = await Promise.all([
    listen<string>('engine:line', ({ payload }) => {
      const line = parseEngineLine(payload)
      if (!line) return
      if (line.type === 'event') handlers.onEvent?.(line)
      else if (line.type === 'memo') handlers.onMemo?.(line)
      else handlers.onOutcome?.(line)
    }),
    listen<string>('engine:log', ({ payload }) => handlers.onLog?.(payload)),
    listen<number | null>('engine:exit', ({ payload }) => handlers.onExit?.(payload)),
  ])

  try {
    await invoke('loop_start', {
      args: {
        workspace_path: args.workspacePath,
        intent: args.intent,
        provider: args.provider,
        model: args.model,
        verify_cmd: args.verifyCmd,
        consent_to_run: args.consentToRun,
        max_iterations: args.maxIterations,
        reflect_model: args.reflectModel ?? null,
      },
    })
  } catch (err) {
    unlisteners.forEach((un) => un())
    throw err
  }

  return {
    abort: () => invoke('loop_abort'),
    dispose: () => unlisteners.forEach((un) => un()),
  }
}
