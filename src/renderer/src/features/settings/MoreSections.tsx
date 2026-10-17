import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ArrowUp, X } from 'lucide-react'
import { SUBTITLE_LANGUAGES } from '@shared/constants/languages'
import type { StorageInfo } from '@shared/contracts/ipc'
import type { AppSettings } from '@shared/settings/schema'
import { useSettings } from '@renderer/app/settings-context'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog'
import { NumberSetting } from './PlaybackSection'

const ignore = () => undefined
const button = 'rounded-md border border-border px-3 py-1.5 text-sm hover:bg-elevated'

function errorText(e: unknown) {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)
}

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string
  title: string
  intro?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 id={`${id}-heading`} className="text-lg font-semibold">
          {title}
        </h2>
        {intro && <p className="text-sm text-muted">{intro}</p>}
      </div>
      <div className="flex flex-col gap-3 text-sm">{children}</div>
    </section>
  )
}

/** Asks before running a destructive action. */
function useConfirm() {
  const [pending, setPending] = useState<{
    title: string
    body: string
    confirmLabel: string
    run: () => void
  } | null>(null)
  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title={pending?.title ?? ''}
      confirmLabel={pending?.confirmLabel ?? 'OK'}
      destructive
      onCancel={() => setPending(null)}
      onConfirm={() => {
        pending?.run()
        setPending(null)
      }}
    >
      {pending?.body}
    </ConfirmDialog>
  )
  return { ask: setPending, dialog }
}

export function GeneralSection({ onRunSetup }: { onRunSetup: () => void }) {
  const { settings, update } = useSettings()
  const { ask, dialog } = useConfirm()
  const [message, setMessage] = useState<string | null>(null)
  if (!settings) return null
  return (
    <Section id="general" title="General">
      <label className="flex items-center gap-2">
        <span className="w-56 text-muted">Open Frame on</span>
        <select
          value={settings.general.startView}
          onChange={(e) =>
            update({
              general: {
                startView: e.currentTarget.value as AppSettings['general']['startView'],
              },
            })
          }
          className="rounded-md border border-border bg-bg px-2 py-1"
        >
          <option value="home">Home</option>
          <option value="movies">Movies</option>
          <option value="shows">TV Shows</option>
          <option value="all">All Media</option>
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRunSetup} className={button}>
          Run first-time setup again
        </button>
        <button
          type="button"
          onClick={() =>
            ask({
              title: 'Reset all settings?',
              body: 'Every setting returns to its default, including theme, shortcuts and subtitle styles. Your library, watch history, bookmarks, collections and saved API keys are kept.',
              confirmLabel: 'Reset settings',
              run: () => {
                window.frame.settings
                  .reset()
                  .then(() => setMessage('Settings were reset to their defaults.'))
                  .catch((e: unknown) => setMessage(errorText(e)))
              },
            })
          }
          className={`${button} text-danger`}
        >
          Reset all settings…
        </button>
      </div>
      {message && (
        <p role="status" className="text-muted">
          {message}
        </p>
      )}
      {dialog}
    </Section>
  )
}

const languageName = (code: string) => SUBTITLE_LANGUAGES.find((l) => l.code === code)?.name ?? code

export function AudioSection() {
  const { settings, update } = useSettings()
  if (!settings) return null
  const langs = settings.audio.preferredLanguages
  const setLangs = (preferredLanguages: string[]) => update({ audio: { preferredLanguages } })
  return (
    <Section
      id="audio"
      title="Audio"
      intro="Changes apply to the playing video immediately, except the starting volume."
    >
      <div className="flex flex-col gap-2">
        <span className="text-muted">
          Preferred audio languages (used when a video has several audio tracks)
        </span>
        {langs.length === 0 && (
          <span className="text-subtle">None: the video’s default track plays.</span>
        )}
        <ol className="flex flex-col gap-1">
          {langs.map((code, i) => (
            <li key={code} className="flex items-center gap-2 rounded-md bg-surface px-3 py-1.5">
              <span className="w-5 text-subtle">{i + 1}.</span>
              <span className="flex-1">{languageName(code)}</span>
              <button
                type="button"
                aria-label={`Move ${languageName(code)} audio up`}
                disabled={i === 0}
                onClick={() => {
                  const next = [...langs]
                  next.splice(i - 1, 0, ...next.splice(i, 1))
                  setLangs(next)
                }}
                className="rounded p-1 text-subtle hover:bg-elevated disabled:opacity-30"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                aria-label={`Remove ${languageName(code)} audio`}
                onClick={() => setLangs(langs.filter((l) => l !== code))}
                className="rounded p-1 text-subtle hover:bg-elevated hover:text-danger"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ol>
        {langs.length < 5 && (
          <select
            aria-label="Add preferred audio language"
            value=""
            onChange={(e) => {
              const code = e.currentTarget.value
              if (code) setLangs([...langs, code])
            }}
            className="w-56 rounded-md border border-border bg-bg px-2 py-1"
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
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.audio.normalizeLoudness}
          onChange={(e) => update({ audio: { normalizeLoudness: e.currentTarget.checked } })}
          className="accent-[var(--frame-accent)]"
        />
        Even out loudness (quiet dialogue louder, loud scenes softer)
      </label>
      <NumberSetting
        label="Starting volume"
        value={settings.playback.defaultVolume}
        min={0}
        max={100}
        suffix="% (applies the next time the player opens)"
        onCommit={(defaultVolume) => update({ playback: { defaultVolume } })}
      />
    </Section>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

export function StorageSection() {
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const { ask, dialog } = useConfirm()

  const refresh = useCallback(() => {
    window.frame.storage.info().then(setInfo).catch(ignore)
  }, [])
  useEffect(refresh, [refresh])

  const clear = (kind: 'artwork' | 'thumbnails', title: string, body: string) =>
    ask({
      title,
      body,
      confirmLabel: 'Clear',
      run: () => {
        window.frame.storage
          .clearCache(kind)
          .then(() => {
            setMessage('Cleared.')
            refresh()
          })
          .catch((e: unknown) => setMessage(errorText(e)))
      },
    })

  return (
    <Section
      id="storage"
      title="Storage and cache"
      intro="Everything Frame stores stays on this computer."
    >
      {info && (
        <dl className="grid grid-cols-[14rem_1fr] gap-x-3 gap-y-1.5" data-testid="storage-info">
          <dt className="text-muted">Data folder</dt>
          <dd className="truncate" title={info.dataDir}>
            {info.dataDir}
          </dd>
          <dt className="text-muted">Library database</dt>
          <dd>{formatBytes(info.databaseBytes)}</dd>
          <dt className="text-muted">Artwork cache (TMDB images)</dt>
          <dd>{formatBytes(info.artworkBytes)}</dd>
          <dt className="text-muted">Timeline previews and bookmarks</dt>
          <dd>{formatBytes(info.thumbnailBytes)}</dd>
          <dt className="text-muted">Database backups</dt>
          <dd>{formatBytes(info.backupBytes)}</dd>
        </dl>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            clear(
              'artwork',
              'Clear the artwork cache?',
              'Posters and backdrops are downloaded again from TMDB when needed (if online lookups are on).',
            )
          }
          className={button}
        >
          Clear artwork cache…
        </button>
        <button
          type="button"
          onClick={() =>
            clear(
              'thumbnails',
              'Clear timeline previews?',
              'Preview images are generated again when you hover the timeline. Bookmark thumbnails are kept.',
            )
          }
          className={button}
        >
          Clear timeline previews…
        </button>
        <button
          type="button"
          onClick={() => {
            window.frame.storage
              .backupNow()
              .then((path) => {
                setMessage(`Backup saved: ${path}`)
                refresh()
              })
              .catch((e: unknown) => setMessage(errorText(e)))
          }}
          className={button}
        >
          Back up database now
        </button>
        <button
          type="button"
          onClick={() => void window.frame.storage.openDataFolder().catch(ignore)}
          className={button}
        >
          Open data folder
        </button>
      </div>
      {message && (
        <p role="status" className="break-all text-muted" data-testid="storage-message">
          {message}
        </p>
      )}
      {dialog}
    </Section>
  )
}

export function PrivacySection() {
  const { settings, update } = useSettings()
  const { ask, dialog } = useConfirm()
  const [message, setMessage] = useState<string | null>(null)
  if (!settings) return null
  const { privacy, subtitles } = settings
  return (
    <Section
      id="privacy"
      title="Privacy"
      intro="Frame has no analytics or telemetry. It contacts only the services below, and only when they are switched on and set up with your own keys. Local playback never needs them."
    >
      <ul className="flex flex-col gap-1 text-muted">
        <li>
          <strong className="text-text">TMDB</strong> (api.themoviedb.org, image.tmdb.org): titles
          and years parsed from file names, to find posters and details. Never file paths or files.
        </li>
        <li>
          <strong className="text-text">OpenSubtitles / SubSource</strong>: title, year, episode,
          IDs and languages when you search for subtitles; a 16-character file fingerprint only if
          you allow it below.
        </li>
      </ul>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={privacy.onlineMetadataEnabled}
          onChange={(e) => update({ privacy: { onlineMetadataEnabled: e.currentTarget.checked } })}
          className="accent-[var(--frame-accent)]"
        />
        Look up movie and show information online (TMDB)
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={privacy.onlineSubtitlesEnabled}
          onChange={(e) => update({ privacy: { onlineSubtitlesEnabled: e.currentTarget.checked } })}
          className="accent-[var(--frame-accent)]"
        />
        Search for subtitles online
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={subtitles.allowFileHash}
          onChange={(e) => update({ subtitles: { allowFileHash: e.currentTarget.checked } })}
          className="accent-[var(--frame-accent)]"
        />
        Send a file fingerprint to OpenSubtitles for exact matches
      </label>
      <div>
        <button
          type="button"
          onClick={() =>
            ask({
              title: 'Clear watch history?',
              body: 'Resume positions and watched marks are forgotten for every video. Bookmarks, collections and the library stay.',
              confirmLabel: 'Clear history',
              run: () => {
                window.frame.history
                  .clearAll()
                  .then(() => setMessage('Watch history cleared.'))
                  .catch((e: unknown) => setMessage(errorText(e)))
              },
            })
          }
          className={`${button} text-danger`}
        >
          Clear watch history…
        </button>
      </div>
      {message && (
        <p role="status" className="text-muted">
          {message}
        </p>
      )}
      {dialog}
    </Section>
  )
}
