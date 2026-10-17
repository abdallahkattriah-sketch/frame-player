import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export const OS_KEY = 'os-e2e-key'
export const SS_KEY = 'ss-e2e-key'

/** "مرحبا بكم" subtitle in Windows-1256, as some providers still serve. */
export const ARABIC_CP1256_SRT = Buffer.concat([
  Buffer.from('1\r\n00:00:00,500 --> 00:00:05,000\r\n'),
  Buffer.from([0xe3, 0xd1, 0xcd, 0xc8, 0xc7, 0x20, 0xc8, 0xdf, 0xe3]),
  Buffer.from('\r\n'),
])

export interface SubtitleMock {
  origin: string
  requests: {
    method: string
    path: string
    headers: Record<string, string | string[] | undefined>
  }[]
  close: () => Promise<void>
}

/**
 * One local server playing both OpenSubtitles (/api/v1/... with Api-Key) and SubSource
 * (/ss/api/v1/... — which fails with 500 to test provider isolation). Shapes follow the
 * providers' published docs.
 */
export async function startSubtitleMock(): Promise<SubtitleMock> {
  const requests: SubtitleMock['requests'] = []
  let origin = ''
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    requests.push({
      method: req.method ?? 'GET',
      path: url.pathname + url.search,
      headers: req.headers,
    })
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }

    if (url.pathname.startsWith('/ss/')) return send(500, { message: 'internal error' })

    if (url.pathname === '/files/ar.srt') {
      res.writeHead(200, { 'content-type': 'application/x-subrip' })
      return res.end(ARABIC_CP1256_SRT)
    }
    if (req.headers['api-key'] !== OS_KEY) return send(401, { message: 'invalid api key' })
    if (url.pathname === '/api/v1/infos/formats')
      return send(200, { data: { output_formats: ['srt'] } })
    if (url.pathname === '/api/v1/subtitles') {
      return send(200, {
        total_count: 1,
        data: [
          {
            id: '9001',
            type: 'subtitle',
            attributes: {
              language: 'ar',
              download_count: 321,
              hearing_impaired: false,
              foreign_parts_only: false,
              fps: 30,
              ratings: 9,
              votes: 2,
              from_trusted: true,
              ai_translated: false,
              machine_translated: false,
              release: 'Test.Pattern.2024.720p',
              feature_details: { year: 2024 },
              files: [{ file_id: 555, file_name: 'Test.Pattern.2024.ar' }],
            },
          },
        ],
      })
    }
    if (url.pathname === '/api/v1/download' && req.method === 'POST') {
      return send(200, {
        link: `${origin}/files/ar.srt`,
        file_name: 'Test.Pattern.2024.ar.srt',
        requests: 1,
        remaining: 4,
        message: 'ok',
        reset_time: '23 hours',
        reset_time_utc: '2030-01-01T00:00:00.000Z',
      })
    }
    return send(404, { message: 'not found' })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { origin, requests, close: () => new Promise((r) => server.close(() => r())) }
}
