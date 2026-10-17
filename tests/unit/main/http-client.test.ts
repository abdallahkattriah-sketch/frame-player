import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { HttpClient, HttpError, parseRetryAfter } from '../../../src/main/network/http-client'

const schema = z.object({ ok: z.boolean() })
const url = new URL('https://api.example.test/thing')

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function client(
  responses: (Response | Error)[],
  extra: Partial<ConstructorParameters<typeof HttpClient>[0]> = {},
) {
  const fetchMock = vi.fn(async () => {
    const next = responses.shift()
    if (!next) throw new Error('no more responses')
    if (next instanceof Error) throw next
    return next
  })
  const sleeps: number[] = []
  const http = new HttpClient({
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    backoffMs: 100,
    ...extra,
  })
  return { http, fetchMock, sleeps }
}

describe('HttpClient', () => {
  it('returns validated JSON and sends headers', async () => {
    const { http, fetchMock } = client([json({ ok: true })])
    await expect(
      http.getJson(url, schema, { headers: { Authorization: 'Bearer x' } }),
    ).resolves.toEqual({ ok: true })
    const init = (fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1]
    expect(init.headers).toMatchObject({ Authorization: 'Bearer x', Accept: 'application/json' })
  })

  it('rejects responses that do not match the schema or are not JSON', async () => {
    const bad = client([json({ ok: 'yes' })])
    await expect(bad.http.getJson(url, schema)).rejects.toMatchObject({ kind: 'invalid-response' })
    const html = client([new Response('<html>error</html>', { status: 200 })])
    await expect(html.http.getJson(url, schema)).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('retries 429 honouring Retry-After, and 5xx with exponential backoff', async () => {
    const { http, sleeps, fetchMock } = client([
      json({}, { status: 429, headers: { 'retry-after': '2' } }),
      json({}, { status: 503 }),
      json({}, { status: 502 }),
      json({ ok: true }),
    ])
    await expect(http.getJson(url, schema)).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(sleeps).toEqual([2000, 200, 400])
  })

  it('gives up after the retry limit with a structured error', async () => {
    const { http } = client([json({}, { status: 500 }), json({}, { status: 500 })], {
      maxRetries: 1,
    })
    const error = await http.getJson(url, schema).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ kind: 'server', status: 500 })
  })

  it('does not retry authentication or not-found errors', async () => {
    const auth = client([json({}, { status: 401 })])
    await expect(auth.http.getJson(url, schema)).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(auth.fetchMock).toHaveBeenCalledTimes(1)
    const missing = client([json({}, { status: 404 })])
    await expect(missing.http.getJson(url, schema)).rejects.toMatchObject({ kind: 'not-found' })
  })

  it('retries network failures and reports them without leaking details', async () => {
    const { http } = client([
      new TypeError('fetch failed: getaddrinfo ENOTFOUND'),
      json({ ok: true }),
    ])
    await expect(http.getJson(url, schema)).resolves.toEqual({ ok: true })
    const offline = client([new TypeError('x'), new TypeError('x')], { maxRetries: 1 })
    await expect(offline.http.getJson(url, schema)).rejects.toMatchObject({
      kind: 'network',
      message: 'Could not reach api.example.test. Check your internet connection.',
    })
  })

  it('times out slow requests', async () => {
    const slow = vi.fn(
      (_u: URL, init: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    )
    const http = new HttpClient({
      fetch: slow as unknown as typeof fetch,
      timeoutMs: 20,
      maxRetries: 0,
    })
    await expect(http.getJson(url, schema)).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('cancels without retrying', async () => {
    const controller = new AbortController()
    const never = vi.fn(
      (_u: URL, init: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    )
    const http = new HttpClient({ fetch: never as unknown as typeof fetch })
    const pending = http.getJson(url, schema, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' })
    expect(never).toHaveBeenCalledTimes(1)
  })

  it('limits concurrent requests per host', async () => {
    let active = 0
    let peak = 0
    const slowFetch = vi.fn(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 10))
      active--
      return json({ ok: true })
    })
    const http = new HttpClient({
      fetch: slowFetch as unknown as typeof fetch,
      maxConcurrentPerHost: 2,
    })
    await Promise.all(Array.from({ length: 6 }, () => http.getJson(url, schema)))
    expect(peak).toBe(2)
  })

  it('refuses oversized downloads', async () => {
    const { http } = client([
      new Response(Buffer.alloc(2000), { headers: { 'content-length': '2000' } }),
    ])
    await expect(http.getBytes(url, { maxBytes: 1000 })).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  })
})

describe('parseRetryAfter', () => {
  it('parses seconds and HTTP dates', () => {
    expect(parseRetryAfter('3')).toBe(3000)
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4000)).toBe(6000)
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
  })

  it('never puts credentials from the URL or headers into error messages', async () => {
    const secret = 'abcdef0123456789abcdef0123456789'
    const secretUrl = new URL(`https://api.example.test/3/search?api_key=${secret}&query=x`)
    const failures: (Response | Error)[] = [
      new Response('nope', { status: 401 }),
      new Response('missing', { status: 404 }),
      new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      new TypeError(`fetch failed for ${secretUrl.href}`),
    ]
    for (const failure of failures) {
      const { http } = client([failure, failure, failure, failure], { maxRetries: 0 })
      const error = await http
        .getJson(secretUrl, schema, { headers: { Authorization: `Bearer ${secret}` } })
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).message).not.toContain(secret)
    }
  })
})
