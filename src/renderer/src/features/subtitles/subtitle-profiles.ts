import {
  activeSubtitleStyle,
  builtInSubtitleProfiles,
  standardSubtitleStyle,
  type SubtitleAppearance,
  type SubtitleStyle,
} from '@shared/settings/subtitle-style'

const MAX_PROFILES = 30

export function updateActiveStyle(
  appearance: SubtitleAppearance,
  patch: Partial<SubtitleStyle>,
): SubtitleAppearance {
  return {
    ...appearance,
    profiles: appearance.profiles.map((p) =>
      p.id === appearance.activeProfileId ? { ...p, style: { ...p.style, ...patch } } : p,
    ),
  }
}

/** Copies the active profile under a new name and makes the copy active. */
export function duplicateActiveProfile(
  appearance: SubtitleAppearance,
  name: string,
  newId: string,
): SubtitleAppearance {
  if (appearance.profiles.length >= MAX_PROFILES) return appearance
  return {
    activeProfileId: newId,
    profiles: [
      ...appearance.profiles,
      { id: newId, name: name.trim() || 'New profile', style: activeSubtitleStyle(appearance) },
    ],
  }
}

export function renameActiveProfile(
  appearance: SubtitleAppearance,
  name: string,
): SubtitleAppearance {
  const trimmed = name.trim()
  if (!trimmed) return appearance
  return {
    ...appearance,
    profiles: appearance.profiles.map((p) =>
      p.id === appearance.activeProfileId ? { ...p, name: trimmed.slice(0, 60) } : p,
    ),
  }
}

/** Removes the active profile (never the last one) and activates the first remaining one. */
export function deleteActiveProfile(appearance: SubtitleAppearance): SubtitleAppearance {
  const profiles = appearance.profiles.filter((p) => p.id !== appearance.activeProfileId)
  const [first] = profiles
  return first ? { activeProfileId: first.id, profiles } : appearance
}

/** Built-in profiles return to their shipped style; custom ones to the standard style. */
export function resetActiveProfile(appearance: SubtitleAppearance): SubtitleAppearance {
  const builtIn = builtInSubtitleProfiles.find((p) => p.id === appearance.activeProfileId)
  return updateActiveStyle(appearance, builtIn?.style ?? standardSubtitleStyle)
}

export function newProfileId(now = Date.now()): string {
  return `custom-${now.toString(36)}`
}
