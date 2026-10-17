import {
  appSettingsSchema,
  defaultSettings,
  settingsSections,
  type AppSettings,
  type SettingsPatch,
  type SettingsSection,
} from '@shared/settings/schema'
import type { SettingsRepository } from '../database/repositories/settings-repository'

export class SettingsService {
  constructor(
    private readonly repository: SettingsRepository,
    private readonly warn: (message: string) => void = console.warn,
  ) {}

  /** Stored values merged over defaults. Unreadable or invalid sections fall back to defaults. */
  get(): AppSettings {
    const stored = new Map(this.repository.getAll().map((row) => [row.section, row.valueJson]))
    const result = structuredClone(defaultSettings)
    for (const section of settingsSections) {
      const json = stored.get(section)
      if (json !== undefined) assignSection(result, section, this.parseSection(section, json))
    }
    return result
  }

  update(patch: SettingsPatch): AppSettings {
    const current = this.get()
    const next = appSettingsSchema.parse(
      Object.fromEntries(
        settingsSections.map((section) => [section, { ...current[section], ...patch[section] }]),
      ),
    )
    for (const section of settingsSections) {
      if (patch[section]) this.repository.upsert(section, JSON.stringify(next[section]))
    }
    return next
  }

  private parseSection<S extends SettingsSection>(section: S, json: string): AppSettings[S] {
    const defaults = defaultSettings[section]
    let raw: unknown
    try {
      raw = JSON.parse(json)
    } catch {
      this.warn(`settings: section "${section}" is not valid JSON; using defaults`)
      return defaults
    }
    // Merge over defaults so settings added in newer versions get their default value.
    const merged =
      typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? { ...defaults, ...raw } : raw
    const parsed = appSettingsSchema.shape[section].safeParse(merged)
    if (!parsed.success) {
      this.warn(`settings: section "${section}" is invalid; using defaults`)
      return defaults
    }
    return parsed.data as AppSettings[S]
  }
}

function assignSection<S extends SettingsSection>(
  target: AppSettings,
  section: S,
  value: AppSettings[S],
) {
  target[section] = value
}
