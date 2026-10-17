export interface Migration {
  version: number
  name: string
  sql: string
}

/** Append-only. Never edit a migration that has shipped; add a new one instead. */
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'settings-and-provider-config',
    sql: `
      CREATE TABLE app_settings (
        section    TEXT PRIMARY KEY NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      -- Non-secret provider configuration only. Secrets live in the credential store.
      CREATE TABLE provider_config (
        provider_id   TEXT PRIMARY KEY NOT NULL,
        enabled       INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
        metadata_json TEXT NOT NULL DEFAULT '{}',
        updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;
    `,
  },
]

export const latestSchemaVersion = migrations.reduce((max, m) => Math.max(max, m.version), 0)
