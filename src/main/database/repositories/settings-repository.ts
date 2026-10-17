import type { Database } from '../connection'

export interface SettingsRow {
  section: string
  valueJson: string
}

export class SettingsRepository {
  constructor(private readonly db: Database) {}

  getAll(): SettingsRow[] {
    return this.db
      .prepare('SELECT section, value_json AS valueJson FROM app_settings')
      .all() as unknown as SettingsRow[]
  }

  upsert(section: string, valueJson: string): void {
    this.db
      .prepare(
        `INSERT INTO app_settings (section, value_json) VALUES (?, ?)
         ON CONFLICT(section) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .run(section, valueJson)
  }
}
