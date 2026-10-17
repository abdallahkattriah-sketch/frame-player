import { useEffect, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, X, XCircle } from 'lucide-react'
import { SUBTITLE_LANGUAGES } from '@shared/constants/languages'
import type { CredentialId, CredentialStoreStatus } from '@shared/contracts/credentials'
import type { ProviderStatus, SubtitleProviderId } from '@shared/contracts/subtitles'
import type { AppSettings } from '@shared/settings/schema'

type SubtitleSettings = AppSettings['subtitles']

function errorText(e: unknown) {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)
}

const languageName = (code: string) => SUBTITLE_LANGUAGES.find((l) => l.code === code)?.name ?? code

function SecretField({
  id,
  label,
  type = 'password',
  configured,
  onSaved,
}: {
  id: CredentialId
  label: string
  type?: 'password' | 'text'
  configured: boolean
  onSaved: (status: CredentialStoreStatus) => void
}) {
  // Unique accessible names: several providers have an "API key" field.
  const provider = id.startsWith('opensubtitles') ? 'OpenSubtitles' : 'SubSource'
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    window.frame.credentials
      .set(id, value)
      .then((s) => {
        setValue('')
        setError(null)
        onSaved(s)
      })
      .catch((err: unknown) => setError(errorText(err)))
  }
  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <label className="w-28 text-muted" htmlFor={`secret-${id}`}>
        {label}
      </label>
      <input
        id={`secret-${id}`}
        type={type}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        placeholder={configured ? 'Saved — enter a new value to replace' : 'Not set'}
        className="min-w-48 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-sm focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        aria-label={`Save ${provider} ${label.toLowerCase()}`}
        disabled={!value.trim()}
        className="rounded-md border border-border px-3 py-1.5 hover:bg-elevated disabled:opacity-40"
      >
        Save
      </button>
      {configured && (
        <button
          type="button"
          aria-label={`Remove ${provider} ${label.toLowerCase()}`}
          onClick={() => void window.frame.credentials.delete(id).then(onSaved)}
          className="rounded-md border border-border px-2 py-1.5 hover:bg-elevated hover:text-danger"
        >
          Remove
        </button>
      )}
      {error && (
        <p role="alert" className="w-full text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  )
}

function ProviderCard({
  status,
  enabled,
  onToggle,
  children,
  hint,
}: {
  status: ProviderStatus | undefined
  enabled: boolean
  onToggle: (on: boolean) => void
  children: React.ReactNode
  hint: string
}) {
  const [checking, setChecking] = useState(false)
  if (!status) return null
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm"
      data-testid={`provider-${status.id}`}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{status.name}</span>
        <label className="ml-auto flex items-center gap-1.5 text-muted">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.currentTarget.checked)}
            className="accent-[var(--frame-accent)]"
          />
          Use for searches
        </label>
        <button
          type="button"
          disabled={!status.configured || checking}
          onClick={() => {
            setChecking(true)
            void window.frame.subtitles
              .validateProvider(status.id)
              .finally(() => setChecking(false))
          }}
          className="rounded-md border border-border px-3 py-1 hover:bg-elevated disabled:opacity-40"
        >
          {checking ? 'Testing…' : 'Test'}
        </button>
      </div>
      {children}
      <p className="text-xs text-subtle">{hint}</p>
      {status.message && (
        <p
          role="status"
          data-testid={`provider-status-${status.id}`}
          className={`flex items-center gap-1.5 ${status.ok ? 'text-accent' : 'text-danger'}`}
        >
          {status.ok ? <CheckCircle2 size={14} aria-hidden /> : <XCircle size={14} aria-hidden />}
          {status.message}
        </p>
      )}
      {status.quota && (
        <p className="text-xs text-muted">
          Downloads remaining: {status.quota.remaining}
          {status.quota.resetsAt
            ? ` (resets ${new Date(status.quota.resetsAt).toLocaleString()})`
            : ''}
        </p>
      )}
    </div>
  )
}

export function SubtitlesSection() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [credentials, setCredentials] = useState<CredentialStoreStatus | null>(null)
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.frame.settings.get().then(setSettings)
    void window.frame.credentials.status().then(setCredentials)
    void window.frame.subtitles.providers().then(setProviders)
    return window.frame.subtitles.onProviders(setProviders)
  }, [])

  const refreshProviders = (status: CredentialStoreStatus) => {
    setCredentials(status)
    void window.frame.subtitles.providers().then(setProviders)
  }

  /** Applies immediately, saves, and reverts on failure. */
  const update = (
    patch: Partial<Omit<SubtitleSettings, 'folder'>>,
    privacy?: { onlineSubtitlesEnabled: boolean },
  ) => {
    const previous = settings
    if (previous) {
      setSettings({
        ...previous,
        subtitles: { ...previous.subtitles, ...patch },
        privacy: { ...previous.privacy, ...privacy },
      })
    }
    window.frame.settings
      .update({ subtitles: patch, ...(privacy ? { privacy } : {}) })
      .then((s) => {
        setSettings(s)
        setError(null)
        void window.frame.subtitles.providers().then(setProviders)
      })
      .catch((e: unknown) => {
        setSettings(previous)
        setError(errorText(e))
      })
  }

  if (!settings) return null
  const s = settings.subtitles
  const langs = s.preferredLanguages
  const move = (index: number, delta: number) => {
    const next = [...langs]
    const [item] = next.splice(index, 1)
    if (item) next.splice(index + delta, 0, item)
    update({ preferredLanguages: next })
  }
  const has = (id: CredentialId) => credentials?.credentials[id] === true
  const status = (id: SubtitleProviderId) => providers.find((p) => p.id === id)

  return (
    <section aria-labelledby="subtitles-heading" className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 id="subtitles-heading" className="text-lg font-semibold">
          Subtitles
        </h2>
        <p className="text-sm text-muted">
          Subtitle files next to your videos are loaded automatically. Online search is optional and
          uses your own provider accounts.
        </p>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <span className="text-muted">
          Preferred languages (first available is shown automatically)
        </span>
        <ol className="flex flex-col gap-1">
          {langs.map((code, i) => (
            <li key={code} className="flex items-center gap-2 rounded-md bg-surface px-3 py-1.5">
              <span className="w-5 text-subtle">{i + 1}.</span>
              <span className="flex-1">{languageName(code)}</span>
              <button
                type="button"
                aria-label={`Move ${languageName(code)} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className="rounded p-1 hover:bg-elevated disabled:opacity-30"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                aria-label={`Move ${languageName(code)} down`}
                disabled={i === langs.length - 1}
                onClick={() => move(i, 1)}
                className="rounded p-1 hover:bg-elevated disabled:opacity-30"
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                aria-label={`Remove ${languageName(code)}`}
                disabled={langs.length === 1}
                onClick={() => update({ preferredLanguages: langs.filter((c) => c !== code) })}
                className="rounded p-1 hover:bg-elevated disabled:opacity-30"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ol>
        {langs.length < 5 && (
          <select
            aria-label="Add preferred language"
            value=""
            onChange={(e) =>
              e.currentTarget.value &&
              update({ preferredLanguages: [...langs, e.currentTarget.value] })
            }
            className="w-56 rounded-md border border-border bg-surface px-2 py-1.5"
          >
            <option value="">Add a language…</option>
            {SUBTITLE_LANGUAGES.filter((l) => !langs.includes(l.code)).map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2">
          Hearing-impaired (SDH) subtitles
          <select
            value={s.hearingImpaired}
            onChange={(e) =>
              update({
                hearingImpaired: e.currentTarget.value as SubtitleSettings['hearingImpaired'],
              })
            }
            className="rounded-md border border-border bg-surface px-2 py-1"
          >
            <option value="include">Allow</option>
            <option value="exclude">Avoid</option>
            <option value="only">Prefer only SDH</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={s.autoLoadLocal}
            onChange={(e) => update({ autoLoadLocal: e.currentTarget.checked })}
            className="accent-[var(--frame-accent)]"
          />
          Load subtitle files found next to videos
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.privacy.onlineSubtitlesEnabled}
            onChange={(e) => update({}, { onlineSubtitlesEnabled: e.currentTarget.checked })}
            className="accent-[var(--frame-accent)]"
          />
          Search subtitles online (contacts the providers below)
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={s.allowFileHash}
            onChange={(e) => update({ allowFileHash: e.currentTarget.checked })}
            className="mt-0.5 accent-[var(--frame-accent)]"
          />
          <span>
            Send a file fingerprint to OpenSubtitles for exact matches
            <span className="block text-xs text-subtle">
              A 16-character hash computed from the video’s size and its first and last 64 KB. It
              identifies the release, not you, and is sent only when you search.
            </span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span>Save downloads</span>
          <select
            aria-label="Save downloads"
            value={s.saveLocation === 'folder' && s.folder ? 'folder' : 'next-to-video'}
            onChange={(e) => {
              if (e.currentTarget.value === 'next-to-video')
                update({ saveLocation: 'next-to-video' })
              else
                void window.frame.subtitles
                  .chooseFolder()
                  .then(() => window.frame.settings.get().then(setSettings))
            }}
            className="rounded-md border border-border bg-surface px-2 py-1"
          >
            <option value="next-to-video">Next to the video</option>
            <option value="folder">In a folder…</option>
          </select>
          {s.saveLocation === 'folder' && s.folder && (
            <>
              <span className="break-all text-muted">{s.folder}</span>
              <button
                type="button"
                onClick={() =>
                  void window.frame.subtitles
                    .chooseFolder()
                    .then(() => window.frame.settings.get().then(setSettings))
                }
                className="rounded-md border border-border px-2 py-1 hover:bg-elevated"
              >
                Change…
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <ProviderCard
        status={status('opensubtitles')}
        enabled={s.providers.opensubtitles}
        onToggle={(on) => update({ providers: { ...s.providers, opensubtitles: on } })}
        hint="Create an API consumer at opensubtitles.com (your profile › API consumers). An account raises the daily download limit. Credentials are stored with Windows data protection."
      >
        <SecretField
          id="opensubtitles.apiKey"
          label="API key"
          configured={has('opensubtitles.apiKey')}
          onSaved={refreshProviders}
        />
        <SecretField
          id="opensubtitles.username"
          label="Username"
          type="text"
          configured={has('opensubtitles.username')}
          onSaved={refreshProviders}
        />
        <SecretField
          id="opensubtitles.password"
          label="Password"
          configured={has('opensubtitles.password')}
          onSaved={refreshProviders}
        />
      </ProviderCard>

      <ProviderCard
        status={status('subsource')}
        enabled={s.providers.subsource}
        onToggle={(on) => update({ providers: { ...s.providers, subsource: on } })}
        hint="Create an API key on subsource.net (account dashboard › API). Free keys allow 60 requests per minute and 7,200 per day. SubSource cannot filter by episode; Frame checks release names instead."
      >
        <SecretField
          id="subsource.apiKey"
          label="API key"
          configured={has('subsource.apiKey')}
          onSaved={refreshProviders}
        />
      </ProviderCard>
    </section>
  )
}
