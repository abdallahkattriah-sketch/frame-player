import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  builtInSubtitleProfiles,
  defaultSubtitleAppearance,
  standardSubtitleStyle,
  subtitleAppearanceSchema,
  subtitleStyleSchema,
} from '@shared/settings/subtitle-style'
import { subtitleStyleProperties } from '../../../src/main/media-engine/subtitle-style-properties'
import { MpvIpcClient } from '../../../src/main/media-engine/mpv-ipc-client'
import { createPipePath } from '../../../src/main/media-engine/mpv-process'

describe('subtitle style', () => {
  it('maps a style to mpv properties with alpha-first colors', () => {
    const props = new Map(
      subtitleStyleProperties({
        ...standardSubtitleStyle,
        textColor: '#ffff00',
        shadowOffset: 2,
        shadowOpacity: 50,
      }),
    )
    expect(props.get('sub-color')).toBe('#FFFFFF00')
    expect(props.get('sub-back-color')).toBe('#80000000')
    expect(props.get('sub-border-style')).toBe('outline-and-shadow')
    expect(props.get('sub-shadow-offset')).toBe(2)
    expect(props.get('sub-ass-override')).toBe('scale')
  })

  it('uses the shared back color for the box, without a shadow', () => {
    const props = new Map(
      subtitleStyleProperties({
        ...standardSubtitleStyle,
        background: 'box',
        backgroundColor: '#202020',
        backgroundOpacity: 0,
        shadowOffset: 3,
        styledSubtitles: 'keep',
      }),
    )
    expect(props.get('sub-border-style')).toBe('background-box')
    expect(props.get('sub-back-color')).toBe('#00202020')
    expect(props.get('sub-shadow-offset')).toBe(0)
    expect(props.get('sub-ass-override')).toBe('no')
  })

  it('ships valid presets and rejects unsafe or inconsistent settings', () => {
    expect(subtitleAppearanceSchema.safeParse(defaultSubtitleAppearance).success).toBe(true)
    expect(builtInSubtitleProfiles.map((p) => p.name)).toEqual([
      'Standard',
      'Arabic movies',
      'English movies',
      'Anime',
      'High contrast',
      'Minimal',
    ])
    for (const bad of [
      { font: 'Arial\nsub-file=x' },
      { textColor: 'red' },
      { fontSize: 1000 },
      { position: 151 },
    ]) {
      expect(subtitleStyleSchema.safeParse({ ...standardSubtitleStyle, ...bad }).success).toBe(
        false,
      )
    }
    expect(
      subtitleAppearanceSchema.safeParse({ ...defaultSubtitleAppearance, activeProfileId: 'gone' })
        .success,
    ).toBe(false)
    const [first] = builtInSubtitleProfiles
    expect(
      subtitleAppearanceSchema.safeParse({
        activeProfileId: 'standard',
        profiles: [first, first],
      }).success,
    ).toBe(false)
  })
})

const mpvPath = join(resolve(__dirname, '../../..'), 'resources', 'mpv', 'mpv.exe')

describe.skipIf(!existsSync(mpvPath))('subtitle style in mpv', () => {
  it('is accepted by the bundled mpv for every preset', async () => {
    const pipe = createPipePath()
    const child = spawn(
      mpvPath,
      ['--no-config', '--idle=yes', '--vo=null', '--ao=null', `--input-ipc-server=${pipe}`],
      { shell: false, windowsHide: true, stdio: 'ignore' },
    )
    try {
      const client = await MpvIpcClient.connect(pipe)
      for (const profile of builtInSubtitleProfiles) {
        for (const [name, value] of subtitleStyleProperties(profile.style)) {
          await client.setProperty(name, value)
          if (typeof value !== 'string' || !value.startsWith('#')) {
            // mpv reports the choice "no" as false.
            const expected = value === 'no' ? false : value
            expect(await client.getProperty(name), `${profile.id} ${name}`).toEqual(expected)
          }
        }
      }
      client.close()
    } finally {
      child.kill()
    }
  })
})
