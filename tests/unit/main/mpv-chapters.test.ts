import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MpvIpcClient } from '../../../src/main/media-engine/mpv-ipc-client'
import { createPipePath } from '../../../src/main/media-engine/mpv-process'
import { parseChapters, toMpvCommands } from '../../../src/main/media-engine/player-state'
import { useTempDirs } from './temp-dir'

const tempDir = useTempDirs()
const root = resolve(__dirname, '../../..')
const mpvPath = join(root, 'resources', 'mpv', 'mpv.exe')
const clip = join(root, 'tests', 'fixtures', 'media', 'أفلام test', 'Test Pattern (2024).mkv')

const chapters = `;FFMETADATA1
[CHAPTER]
TIMEBASE=1/1000
START=0
END=4000
title=Opening
[CHAPTER]
TIMEBASE=1/1000
START=4000
END=9000
title=الفصل الثاني
[CHAPTER]
TIMEBASE=1/1000
START=9000
END=12000
`

// The synthetic clips have no chapters (mpv's encoder drops them), so mpv loads them from a
// side file here; Frame reads the same chapter-list property for chapters inside files.
describe.skipIf(!existsSync(mpvPath) || !existsSync(clip))('chapters from real mpv', () => {
  it('parses the chapter list mpv reports and moves between chapters', async () => {
    const file = join(tempDir(), 'chapters.txt')
    writeFileSync(file, chapters)
    const pipe = createPipePath()
    const child = spawn(
      mpvPath,
      [
        '--no-config',
        '--idle=yes',
        '--pause',
        '--vo=null',
        '--ao=null',
        `--chapters-file=${file}`,
        `--input-ipc-server=${pipe}`,
        clip,
      ],
      { shell: false, windowsHide: true, stdio: 'ignore' },
    )
    try {
      const client = await MpvIpcClient.connect(pipe)
      await expect
        .poll(async () => parseChapters(await client.getProperty('chapter-list').catch(() => [])))
        .toEqual([
          { title: 'Opening', time: 0 },
          { title: 'الفصل الثاني', time: 4 },
          { title: null, time: 9 },
        ])
      for (const command of toMpvCommands({ type: 'chapter', direction: 'next' })) {
        await client.command(...command)
      }
      await expect.poll(() => client.getProperty('chapter')).toBe(1)
      client.close()
    } finally {
      child.kill()
    }
  })
})
