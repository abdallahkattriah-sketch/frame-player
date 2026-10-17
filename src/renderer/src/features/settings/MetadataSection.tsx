import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, KeyRound, RefreshCw, XCircle } from 'lucide-react'
import type { CredentialStoreStatus } from '@shared/contracts/credentials'
import type { MetadataStatus, TokenTestResult } from '@shared/contracts/metadata'
import type { AppSettings } from '@shared/settings/schema'
import { TMDB_NOTICE, TmdbLogo } from './TmdbLogo'

const languages = [
  ['en-US', 'English'],
  ['ar-SA', 'Arabic'],
  ['fr-FR', 'French'],
  ['de-DE', 'German'],
  ['es-ES', 'Spanish'],
  ['it-IT', 'Italian'],
  ['ja-JP', 'Japanese'],
  ['ko-KR', 'Korean'],
  ['pt-BR', 'Portuguese (Brazil)'],
  ['tr-TR', 'Turkish'],
  ['zh-CN', 'Chinese (Simplified)'],
] as const

function errorText(e: unknown) {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)
}

export function MetadataSection() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [credentials, setCredentials] = useState<CredentialStoreStatus | null>(null)
  const [status, setStatus] = useState<MetadataStatus | null>(null)
  const [token, setToken] = useState('')
  const [test, setTest] = useState<TokenTestResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.frame.settings.get().then(setSettings)
    void window.frame.credentials.status().then(setCredentials)
    void window.frame.metadata.status().then(setStatus)
    // Other sections (e.g. Privacy) and resets change the same settings.
    const offSettings = window.frame.settings.onChanged(setSettings)
    const offStatus = window.frame.metadata.onStatus(setStatus)
    return () => {
      offSettings()
      offStatus()
    }
  }, [])

  /** Applies the change immediately, then saves; reverts if saving fails. */
  const update = (patch: Parameters<typeof window.frame.settings.update>[0]) => {
    const previous = settings
    if (previous) {
      setSettings({
        ...previous,
        privacy: { ...previous.privacy, ...patch.privacy },
        metadata: { ...previous.metadata, ...patch.metadata },
      })
    }
    return window.frame.settings
      .update(patch)
      .then(setSettings)
      .catch((e: unknown) => {
        setSettings(previous)
        setError(errorText(e))
      })
  }

  const saveToken = (e: FormEvent) => {
    e.preventDefault()
    if (!token.trim()) return
    setBusy(true)
    setError(null)
    window.frame.credentials
      .set('tmdb.accessToken', token)
      .then(async (s) => {
        setCredentials(s)
        setToken('')
        setTest(await window.frame.metadata.testToken())
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false))
  }

  const removeToken = () => {
    window.frame.credentials
      .delete('tmdb.accessToken')
      .then((s) => {
        setCredentials(s)
        setTest(null)
      })
      .catch((e: unknown) => setError(errorText(e)))
  }

  const configured = credentials?.credentials['tmdb.accessToken'] === true
  const enabled = settings?.privacy.onlineMetadataEnabled ?? true

  return (
    <section aria-labelledby="metadata-heading" className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 id="metadata-heading" className="text-lg font-semibold">
          Movie and TV information
        </h2>
        <p className="text-sm text-muted">
          Frame can identify your files with TMDB to show posters, overviews, and cast. Only titles
          and years from file names are sent; your videos and folders never leave this computer.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            void update({ privacy: { onlineMetadataEnabled: e.currentTarget.checked } })
          }
          className="accent-[var(--frame-accent)]"
        />
        Look up information online (contacts api.themoviedb.org and image.tmdb.org)
      </label>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <KeyRound size={16} aria-hidden /> TMDB API Read Access Token
          <span
            className={`ml-auto text-xs ${configured ? 'text-accent' : 'text-subtle'}`}
            data-testid="tmdb-token-status"
          >
            {configured ? 'Saved (encrypted)' : 'Not set'}
          </span>
        </div>
        {credentials && !credentials.encryptionAvailable && (
          <p role="alert" className="mb-3 text-sm text-danger">
            Windows secure storage is not available, so credentials cannot be saved.
          </p>
        )}
        <form onSubmit={saveToken} className="flex gap-2">
          <input
            type="password"
            aria-label="TMDB token"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.currentTarget.value)}
            placeholder={
              configured ? 'Enter a new token to replace the saved one' : 'Paste your token'
            }
            className="flex-1 rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-sm focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Save TMDB token"
            disabled={!token.trim() || busy}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:brightness-110 disabled:opacity-40"
          >
            Save
          </button>
          {configured && (
            <>
              <button
                type="button"
                onClick={() => {
                  setBusy(true)
                  void window.frame.metadata
                    .testToken()
                    .then(setTest)
                    .finally(() => setBusy(false))
                }}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-elevated"
              >
                Test
              </button>
              <button
                type="button"
                onClick={removeToken}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-elevated hover:text-danger"
              >
                Remove
              </button>
            </>
          )}
        </form>
        <p className="mt-2 text-xs text-subtle">
          Create a free token in your TMDB account under Settings › API. It is stored with Windows
          data protection and only used by Frame’s background process.
        </p>
        {test && (
          <p
            role="status"
            data-testid="tmdb-test-result"
            className={`mt-2 flex items-center gap-1.5 text-sm ${test.ok ? 'text-accent' : 'text-danger'}`}
          >
            {test.ok ? <CheckCircle2 size={14} aria-hidden /> : <XCircle size={14} aria-hidden />}
            {test.message}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Language
          <select
            value={settings?.metadata.language ?? 'en-US'}
            onChange={(e) => void update({ metadata: { language: e.currentTarget.value } })}
            className="rounded-md border border-border bg-surface px-2 py-1.5"
          >
            {languages.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings?.metadata.autoIdentify ?? true}
            onChange={(e) => void update({ metadata: { autoIdentify: e.currentTarget.checked } })}
            className="accent-[var(--frame-accent)]"
          />
          Identify new files automatically
        </label>
        <button
          type="button"
          disabled={!configured || !enabled || status?.identifying}
          onClick={() => void window.frame.metadata.identifyNow()}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-elevated disabled:opacity-40"
        >
          <RefreshCw size={14} className={status?.identifying ? 'animate-spin' : ''} aria-hidden />
          Identify library now
        </button>
      </div>
      {status?.identifying && (
        <p role="status" className="text-sm text-muted" data-testid="identify-progress">
          Identifying… {status.done} of {status.pending}
        </p>
      )}
      {status?.lastError && !status.identifying && (
        <p role="alert" className="text-sm text-danger">
          {status.lastError}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-3 text-xs text-subtle">
        <TmdbLogo />
        <span>{TMDB_NOTICE}</span>
      </div>
    </section>
  )
}
