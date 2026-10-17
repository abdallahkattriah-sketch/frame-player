import { describe, expect, it } from 'vitest'
import {
  defaultSubtitleAppearance,
  standardSubtitleStyle,
  subtitleAppearanceSchema,
} from '@shared/settings/subtitle-style'
import {
  deleteActiveProfile,
  duplicateActiveProfile,
  newProfileId,
  renameActiveProfile,
  resetActiveProfile,
  updateActiveStyle,
} from '@renderer/features/subtitles/subtitle-profiles'

const valid = (a: unknown) => subtitleAppearanceSchema.safeParse(a).success

describe('subtitle profiles', () => {
  it('edits only the active profile', () => {
    const next = updateActiveStyle(
      { ...defaultSubtitleAppearance, activeProfileId: 'anime' },
      { fontSize: 50 },
    )
    expect(next.profiles.find((p) => p.id === 'anime')?.style.fontSize).toBe(50)
    expect(next.profiles.find((p) => p.id === 'standard')?.style.fontSize).toBe(38)
  })

  it('duplicates, renames, resets, and deletes while staying valid', () => {
    const id = newProfileId(1_700_000_000_000)
    expect(id).toMatch(/^[a-z0-9-]{1,40}$/)
    let a = updateActiveStyle(defaultSubtitleAppearance, { textColor: '#00FF00' })
    a = duplicateActiveProfile(a, 'My style', id)
    expect(a.activeProfileId).toBe(id)
    expect(a.profiles.at(-1)).toMatchObject({ name: 'My style', style: { textColor: '#00FF00' } })
    a = renameActiveProfile(a, '  Renamed  ')
    expect(a.profiles.at(-1)?.name).toBe('Renamed')
    expect(renameActiveProfile(a, '   ')).toBe(a)
    a = resetActiveProfile(a)
    expect(a.profiles.at(-1)?.style).toEqual(standardSubtitleStyle)
    expect(valid(a)).toBe(true)
    a = deleteActiveProfile(a)
    expect(a.activeProfileId).toBe('standard')
    expect(valid(a)).toBe(true)
  })

  it('resets a built-in profile to its shipped style and never deletes the last profile', () => {
    let a = { ...defaultSubtitleAppearance, activeProfileId: 'high-contrast' }
    a = updateActiveStyle(a, { textColor: '#123456' })
    a = resetActiveProfile(a)
    expect(a.profiles.find((p) => p.id === 'high-contrast')?.style.textColor).toBe('#FFFF00')
    const only = a.profiles[0]
    if (!only) throw new Error('no profiles')
    const single = { activeProfileId: only.id, profiles: [only] }
    expect(deleteActiveProfile(single)).toBe(single)
  })
})
