import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MpvIpcClient } from '../../../src/main/media-engine/mpv-ipc-client'
import { createPipePath } from '../../../src/main/media-engine/mpv-process'
import { LOUDNESS_FILTER } from '../../../src/main/media-engine/audio-filter'

const root = resolve(__dirname, '../../..')
const mpvPath = join(root, 'resources', 'mpv', 'mpv.exe')
const clip = join(root, 'tests', 'fixtures', 'media', 'أفلام test', 'Test Pattern (2024).mkv')

describe.skipIf(!existsSync(mpvPath) || !existsSync(clip))('audio settings in real mpv', () => {
  it('runs the loudness filter on playing audio and removes it again', async () => {
    const pipe = createPipePath()
    const child = spawn(
      mpvPath,
      [
        '--no-config',
        '--idle=yes',
        '--vo=null',
        '--ao=null',
        '--loop-file=inf',
        `--input-ipc-server=${pipe}`,
        clip,
      ],
      { shell: false, windowsHide: true, stdio: 'ignore' },
    )
    try {
      const client = await MpvIpcClient.connect(pipe)
      await client.setProperty('alang', 'ar,en')
      await client.setProperty('af', LOUDNESS_FILTER)
      const filters = (await client.getProperty('af')) as { name: string }[]
      expect(filters.map((f) => f.name)).toEqual(['lavfi'])
      // Audio keeps flowing through the filter.
      await expect
        .poll(async () => {
          const params = (await client.getProperty('audio-out-params').catch(() => null)) as {
            samplerate?: number
          } | null
          return (params?.samplerate ?? 0) > 0
        })
        .toBe(true)
      expect(child.exitCode).toBeNull()
      await client.setProperty('af', '')
      expect(await client.getProperty('af')).toEqual([])
      client.close()
    } finally {
      child.kill()
    }
  })
})
