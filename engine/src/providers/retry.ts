/**
 * Error-path coverage (ROADMAP.md Phase 4, issue #38): rate limits and
 * transient network failures are normal weather for a loop that makes dozens
 * of API calls — they get bounded retries with backoff, not a crashed
 * iteration. Anything non-transient returns/throws immediately; the caller
 * owns those.
 *
 * Deliberately generic: both provider adapters ride this one helper, and the
 * injected fetch keeps every branch unit-testable without a network.
 */

export interface RetryPolicy {
  /** Total attempts including the first (default 4 → up to 3 retries). */
  maxAttempts?: number
  /** Backoff base for attempt n: base * 2^(n-1), ±25% jitter (default 500ms). */
  baseDelayMs?: number
  signal?: AbortSignal
  /** Injection point for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
  /** Injection point for tests — replaces real waiting. */
  sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** 408/429 and the 5xx family (incl. Anthropic's 529 overload) are transient. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599)
}

function abortError(): DOMException {
  return new DOMException('Request aborted.', 'AbortError')
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(id)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Retry-After arrives as seconds or an HTTP date; absent/garbage → null. */
export function retryAfterMs(header: string | null): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(header)
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now())
  return null
}

/**
 * fetch with bounded retries on transient failures. Returns the final
 * Response (retryable-status responses are returned once attempts run out —
 * the caller's status handling stays in charge of error text). Network-level
 * failures rethrow the last error once attempts run out. Abort wins
 * immediately, including mid-backoff.
 */
export async function fetchWithRetry(url: string, init: RequestInit, policy: RetryPolicy = {}): Promise<Response> {
  const maxAttempts = policy.maxAttempts ?? 4
  const baseDelayMs = policy.baseDelayMs ?? 500
  const doFetch = policy.fetchImpl ?? fetch
  const doSleep = policy.sleepImpl ?? sleep

  let lastNetworkError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (policy.signal?.aborted) throw abortError()

    let response: Response | null = null
    try {
      response = await doFetch(url, { ...init, signal: policy.signal })
    } catch (err) {
      // fetch rejects on network-level failure (DNS, reset, offline) — and on
      // abort, which must not be retried.
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      lastNetworkError = err
    }

    if (response) {
      if (!isRetryableStatus(response.status) || attempt === maxAttempts) return response
    } else if (attempt === maxAttempts) {
      throw lastNetworkError
    }

    const hinted = response ? retryAfterMs(response.headers.get('retry-after')) : null
    const backoff = baseDelayMs * 2 ** (attempt - 1)
    const jittered = backoff * (0.75 + Math.random() * 0.5)
    await doSleep(hinted ?? jittered, policy.signal)
  }

  // Unreachable: every loop path returns or throws by the last attempt.
  throw lastNetworkError ?? new Error('fetchWithRetry exhausted attempts without a response (bug).')
}

/**
 * A context-window overflow is not transient and not a crash — it's a clean,
 * actionable stop: the workspace reads were too large for one iteration.
 * Both adapters detect the provider's wording and throw this named error.
 */
export class ContextLimitError extends Error {
  constructor(providerId: string, detail: string) {
    super(
      `The request exceeded ${providerId}'s context window. The files read this iteration are too large — ` +
        `narrow the intent, split the work, or point the loop at a smaller area. (${detail.slice(0, 200)})`,
    )
    this.name = 'ContextLimitError'
  }
}

const CONTEXT_LIMIT_PATTERNS = [/context.length/i, /context.window/i, /prompt is too long/i, /maximum.{0,20}tokens/i]

export function looksLikeContextLimit(status: number, bodyText: string): boolean {
  return status === 400 && CONTEXT_LIMIT_PATTERNS.some((re) => re.test(bodyText))
}
