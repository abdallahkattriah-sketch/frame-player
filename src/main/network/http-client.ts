import type { z } from 'zod'

export type HttpErrorKind =
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'unauthorized'
  | 'not-found'
  | 'rate-limited'
  | 'server'
  | 'http'
  | 'invalid-response'

/** Structured failure; `message` is safe to show (never contains credentials). */
export class HttpError extends Error {
  constructor(
    readonly kind: HttpErrorKind,
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export interface HttpClientOptions {
  fetch?: typeof fetch
  timeoutMs?: number
  /** Retries for network errors, 429, and 5xx. */
  maxRetries?: number
  /** Concurrent requests per host. */
  maxConcurrentPerHost?: number
  /** Base for exponential backoff. */
  backoffMs?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

export interface RequestOptions {
  headers?: Record<string, string>
  signal?: AbortSignal
}

const RETRYABLE: ReadonlySet<HttpErrorKind> = new Set([
  'network',
  'rate-limited',
  'server',
  'timeout',
])
const MAX_RETRY_AFTER_MS = 60_000

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new HttpError('cancelled', 'Request cancelled.'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new HttpError('cancelled', 'Request cancelled.'))
      },
      { once: true },
    )
  })
}

/** Parses Retry-After (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}

/** Limits concurrent async work. */
class Semaphore {
  private active = 0
  private readonly queue: (() => void)[] = []
  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.queue.push(r))
    this.active++
    try {
      return await task()
    } finally {
      this.active--
      this.queue.shift()?.()
    }
  }
}

/**
 * JSON-over-HTTP with timeouts, cancellation, retries with backoff (honouring Retry-After),
 * per-host concurrency limits, and schema validation of every response.
 */
export class HttpClient {
  private readonly hosts = new Map<string, Semaphore>()
  private readonly fetchImpl: typeof fetch
  private readonly sleep: NonNullable<HttpClientOptions['sleep']>

  constructor(private readonly options: HttpClientOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch
    this.sleep = options.sleep ?? defaultSleep
  }

  async getJson<S extends z.ZodType>(
    url: URL,
    schema: S,
    request: RequestOptions = {},
  ): Promise<z.infer<S>> {
    const response = await this.send(url, request, 'application/json')
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new HttpError('invalid-response', `${url.host} returned a response that is not JSON.`)
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      throw new HttpError('invalid-response', `${url.host} returned data in an unexpected format.`)
    }
    return parsed.data
  }

  /** Raw bytes, with the response content type. */
  async getBytes(
    url: URL,
    request: RequestOptions & { maxBytes: number },
  ): Promise<{ bytes: Buffer; contentType: string }> {
    const response = await this.send(url, request, '*/*')
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > request.maxBytes) throw new HttpError('invalid-response', 'The file is too large.')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > request.maxBytes)
      throw new HttpError('invalid-response', 'The file is too large.')
    return { bytes, contentType: response.headers.get('content-type') ?? '' }
  }

  private async send(url: URL, request: RequestOptions, accept: string): Promise<Response> {
    const limiter = this.limiter(url.host)
    const maxRetries = this.options.maxRetries ?? 3
    const backoff = this.options.backoffMs ?? 500
    let attempt = 0

    for (;;) {
      try {
        return await limiter.run(() => this.attempt(url, request, accept))
      } catch (error) {
        const e =
          error instanceof HttpError ? error : new HttpError('network', describeNetworkError(url))
        if (!RETRYABLE.has(e.kind) || attempt >= maxRetries || request.signal?.aborted) throw e
        const wait = e.retryAfterMs ?? backoff * 2 ** attempt
        if (wait > MAX_RETRY_AFTER_MS) throw e
        attempt++
        await this.sleep(wait, request.signal)
      }
    }
  }

  private async attempt(url: URL, request: RequestOptions, accept: string): Promise<Response> {
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 15_000)
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        headers: { Accept: accept, ...request.headers },
        signal,
        redirect: 'follow',
      })
    } catch {
      if (request.signal?.aborted) throw new HttpError('cancelled', 'Request cancelled.')
      if (timeout.aborted) throw new HttpError('timeout', `${url.host} did not respond in time.`)
      throw new HttpError('network', describeNetworkError(url))
    }
    if (response.ok) return response

    // Drain the body so the connection can be reused.
    await response.arrayBuffer().catch(() => undefined)
    const status = response.status
    if (status === 401 || status === 403) {
      throw new HttpError(
        'unauthorized',
        `${url.host} rejected the credentials (HTTP ${status}).`,
        status,
      )
    }
    if (status === 404)
      throw new HttpError('not-found', `${url.host} could not find that item.`, status)
    if (status === 429) {
      throw new HttpError(
        'rate-limited',
        `${url.host} is limiting requests; Frame will retry shortly.`,
        status,
        parseRetryAfter(response.headers.get('retry-after')),
      )
    }
    if (status >= 500)
      throw new HttpError('server', `${url.host} had a server error (HTTP ${status}).`, status)
    throw new HttpError('http', `${url.host} returned HTTP ${status}.`, status)
  }

  private limiter(host: string): Semaphore {
    let limiter = this.hosts.get(host)
    if (!limiter) {
      limiter = new Semaphore(this.options.maxConcurrentPerHost ?? 4)
      this.hosts.set(host, limiter)
    }
    return limiter
  }
}

function describeNetworkError(url: URL): string {
  return `Could not reach ${url.host}. Check your internet connection.`
}
