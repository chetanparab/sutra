/**
 * Real Reflect (ROADMAP.md Phase 2): an LLM call that turns a failing verify
 * run into a courier memo — a finding (what went wrong) and a directive (what
 * the next iteration's Build should do differently). The shape matches the
 * HermesMemo the web UI's flight recorder already renders, so a real loop's
 * memos plug into the existing surfaces unchanged.
 */
import type { LlmProvider } from '../../../src/contracts/llm'

const REFLECT_SYSTEM_PROMPT =
  'You are the courier of an iterative engineering loop. An automated build just ' +
  'failed its verification run. From the intent and the verification output, write ' +
  'a memo for the next iteration. Respond with ONLY a JSON object, no code fences, ' +
  'shaped exactly: {"finding": "<one or two sentences: the concrete reason ' +
  'verification failed>", "directive": "<one or two sentences: the specific change ' +
  'the next build attempt should make>"}. Be concrete — name files, functions and ' +
  'cases from the output, not generalities.'

export interface ReflectParams {
  provider: LlmProvider
  model: string
  intent: string
  iteration: number
  /** Tail of the failing verify run's output (see outputTailForMemo). */
  verifyOutputTail: string
  signal?: AbortSignal
}

export interface ReflectMemo {
  finding: string
  directive: string
  usage: { inputTokens: number; outputTokens: number }
}

/**
 * Pulls the first JSON object out of a completion that may have prose or code
 * fences around it — models don't always obey "ONLY a JSON object", and a memo
 * is not worth failing an iteration over.
 */
export function extractMemoJson(text: string): { finding: string; directive: string } | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  // Walk to the matching close brace instead of regexing — findings often
  // contain nested braces from code snippets.
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>
          if (typeof parsed.finding === 'string' && typeof parsed.directive === 'string') {
            return { finding: parsed.finding, directive: parsed.directive }
          }
        } catch {
          /* fall through to null */
        }
        return null
      }
    }
  }
  return null
}

export async function reflect(params: ReflectParams): Promise<ReflectMemo> {
  const completion = await params.provider.complete({
    messages: [
      { role: 'system', content: REFLECT_SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `Intent: ${params.intent}\n\n` +
          `Iteration ${params.iteration} failed verification. Output (tail):\n\n${params.verifyOutputTail}`,
      },
    ],
    opts: { model: params.model, maxTokens: 1000, signal: params.signal },
  })

  const usage = {
    inputTokens: completion.usage?.inputTokens ?? 0,
    outputTokens: completion.usage?.outputTokens ?? 0,
  }

  const parsed = extractMemoJson(completion.text)
  if (parsed) return { ...parsed, usage }

  // Fallback: a malformed memo must not kill the iteration — carry the raw
  // text as the finding and keep a generic directive. Recorded honestly rather
  // than pretending the model followed the format.
  return {
    finding: completion.text.trim().slice(0, 500) || 'Verification failed; the reflect model returned no usable memo.',
    directive: 'Re-read the failing verification output above and fix the specific failing cases.',
    usage,
  }
}
