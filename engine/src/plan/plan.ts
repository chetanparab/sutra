/**
 * Spec-mode-real (ROADMAP.md Phase 5+): before a spec-driven run builds
 * anything, one LLM call drafts a real, repo-grounded spec — requirements,
 * an approach, and a task breakdown — for the human to review and edit. This
 * REPLACES the scripted Spec demo's canned requirements.md/design.md/tasks.md
 * with the model's actual plan for THIS intent in THIS repo.
 *
 * It is a single planning call (like Reflect), not a loop: the loop executes
 * the approved spec afterwards, unchanged. Grounded in the repo by a shallow
 * file listing so the plan references real files, not invented ones.
 */
import type { LlmProvider } from '../../../src/contracts/llm'
import { createFsTools } from '../tools/fs'

const PLAN_SYSTEM_PROMPT =
  'You are a senior engineer planning a change before writing any code. From the intent and ' +
  'the repository listing, produce a concise, concrete spec for THIS repo — no boilerplate, no ' +
  'restating the intent. Respond with ONLY a JSON object, no code fences, shaped exactly: ' +
  '{"requirements": ["<testable statement of something that must be true when done>", …], ' +
  '"approach": "<2-4 sentences: how you will implement it, naming real files/modules where you can>", ' +
  '"tasks": [{"title": "<short imperative>", "detail": "<one line: what this task does>"}, …]}. ' +
  'Keep it tight: 3-6 requirements, 3-8 tasks. Requirements must be checkable (a test or an ' +
  'observable behavior), not vague goals.'

export interface PlannedTask {
  title: string
  detail: string
}

export interface PlannedSpec {
  requirements: string[]
  approach: string
  tasks: PlannedTask[]
}

export interface PlanParams {
  provider: LlmProvider
  model: string
  intent: string
  workspaceRoot: string
  signal?: AbortSignal
}

export interface PlanResult {
  spec: PlannedSpec
  usage: { inputTokens: number; outputTokens: number }
}

/** A shallow tree of the repo — enough for the model to reference real files, cheap to gather. */
export function shallowRepoListing(workspaceRoot: string, maxEntries = 60): string {
  const tools = createFsTools(workspaceRoot)
  const lines: string[] = []
  const walk = (rel: string, depth: number) => {
    if (lines.length >= maxEntries || depth > 2) return
    let entries
    try {
      entries = tools.listDir(rel)
    } catch {
      return
    }
    for (const e of entries) {
      if (lines.length >= maxEntries) return
      if (e.name === '.git' || e.name === 'node_modules' || e.name.startsWith('.')) continue
      const path = rel === '.' ? e.name : `${rel}/${e.name}`
      lines.push(`${'  '.repeat(depth)}${e.name}${e.type === 'dir' ? '/' : ''}`)
      if (e.type === 'dir') walk(path, depth + 1)
    }
  }
  walk('.', 0)
  return lines.length > 0 ? lines.join('\n') : '(empty folder — a new project)'
}

/** Pull the first balanced JSON object out of a completion (models add prose/fences). */
export function extractPlanJson(text: string): PlannedSpec | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>
          const requirements = Array.isArray(parsed.requirements) ? parsed.requirements.filter((r): r is string => typeof r === 'string') : []
          const approach = typeof parsed.approach === 'string' ? parsed.approach : ''
          const tasks = Array.isArray(parsed.tasks)
            ? parsed.tasks
                .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
                .map((t) => ({ title: String(t.title ?? '').trim(), detail: String(t.detail ?? '').trim() }))
                .filter((t) => t.title !== '')
            : []
          if (requirements.length === 0 && tasks.length === 0) return null
          return { requirements, approach, tasks }
        } catch {
          return null
        }
      }
    }
  }
  return null
}

export async function plan(params: PlanParams): Promise<PlanResult> {
  const listing = shallowRepoListing(params.workspaceRoot)
  const completion = await params.provider.complete({
    messages: [
      { role: 'system', content: PLAN_SYSTEM_PROMPT },
      { role: 'user', content: `Intent: ${params.intent}\n\nRepository:\n${listing}` },
    ],
    opts: { model: params.model, maxTokens: 1500, signal: params.signal },
  })

  const usage = {
    inputTokens: completion.usage?.inputTokens ?? 0,
    outputTokens: completion.usage?.outputTokens ?? 0,
  }

  const spec = extractPlanJson(completion.text)
  if (spec) return { spec, usage }

  // A malformed plan shouldn't dead-end the user: carry a minimal honest spec
  // built from the intent, clearly marked, so they can edit and proceed.
  return {
    spec: {
      requirements: [`The change satisfies: ${params.intent}`],
      approach: completion.text.trim().slice(0, 400) || 'The planning model returned no usable plan — edit this before building.',
      tasks: [{ title: 'Implement the intent', detail: params.intent }],
    },
    usage,
  }
}

/** Fold an approved spec into one intent string the Build loop can execute. */
export function specToIntent(intent: string, spec: PlannedSpec): string {
  const reqs = spec.requirements.map((r) => `- ${r}`).join('\n')
  const tasks = spec.tasks.map((t, i) => `${i + 1}. ${t.title} — ${t.detail}`).join('\n')
  return (
    `${intent}\n\n` +
    `Approved plan — implement all of it:\n\n` +
    (spec.approach ? `Approach: ${spec.approach}\n\n` : '') +
    (reqs ? `Requirements (all must hold):\n${reqs}\n\n` : '') +
    (tasks ? `Tasks:\n${tasks}` : '')
  ).trim()
}
