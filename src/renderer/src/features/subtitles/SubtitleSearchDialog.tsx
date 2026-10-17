import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Download, Loader2, Search, X } from 'lucide-react'
import { SUBTITLE_LANGUAGES } from '@shared/constants/languages'
import type {
  ProviderStatus,
  SubtitleProviderId,
  SubtitleResult,
  SubtitleSearchResponse,
  SubtitleTarget,
} from '@shared/contracts/subtitles'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog'

export interface SubtitleSearchDialogProps {
  target: SubtitleTarget
  /** Shown in the header, e.g. the video file name. */
  label: string
  isEpisode: boolean
  onClose: () => void
}

function errorText(e: unknown) {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)
}

function Flag({
  children,
  tone = 'muted',
}: {
  children: string
  tone?: 'muted' | 'accent' | 'warn'
}) {
  const color =
    tone === 'accent'
      ? 'text-accent border-accent/40'
      : tone === 'warn'
        ? 'text-danger border-danger/40'
        : 'text-muted border-border'
  return <span className={`rounded border px-1.5 py-0.5 text-[11px] ${color}`}>{children}</span>
}

/**
 * Searches enabled providers, shows only what they returned, and downloads the chosen
 * subtitle next to the video (asking before replacing an existing file).
 */
export function SubtitleSearchDialog({
  target,
  label,
  isEpisode,
  onClose,
}: SubtitleSearchDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [languages, setLanguages] = useState<string[]>([])
  const [hearingImpaired, setHearingImpaired] = useState<'include' | 'exclude' | 'only'>('include')
  const [query, setQuery] = useState('')
  const [season, setSeason] = useState('')
  const [episode, setEpisode] = useState('')
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [selectedProviders, setSelectedProviders] = useState<SubtitleProviderId[]>([])
  const [response, setResponse] = useState<SubtitleSearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    result: SubtitleResult
    path: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
    let active = true
    void Promise.all([window.frame.settings.get(), window.frame.subtitles.providers()]).then(
      ([s, p]) => {
        if (!active) return
        setLanguages(s.subtitles.preferredLanguages)
        setHearingImpaired(s.subtitles.hearingImpaired)
        setProviders(p)
        setSelectedProviders(p.filter((x) => x.enabled && x.configured).map((x) => x.id))
      },
    )
    return () => {
      active = false
    }
  }, [])

  const search = (e?: FormEvent) => {
    e?.preventDefault()
    if (languages.length === 0 || selectedProviders.length === 0) return
    setSearching(true)
    setError(null)
    setNotice(null)
    window.frame.subtitles
      .search({
        target,
        languages,
        hearingImpaired,
        providers: selectedProviders,
        ...(query.trim() ? { query: query.trim() } : {}),
        ...(season ? { season: Number(season) } : {}),
        ...(episode ? { episode: Number(episode) } : {}),
      })
      .then(setResponse)
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setSearching(false))
  }

  const download = (result: SubtitleResult, overwrite = false) => {
    setDownloading(result.id)
    setNotice(null)
    window.frame.subtitles
      .download({
        target,
        provider: result.provider,
        resultId: result.id,
        language:
          result.language && /^[a-z]{2}(?:-[A-Z]{2})?$/.test(result.language)
            ? result.language
            : null,
        hearingImpaired: result.hearingImpaired,
        forced: result.forced,
        overwrite,
      })
      .then((r) => {
        if (r.status === 'exists') setPendingOverwrite({ result, path: r.path })
        else if (r.status === 'saved') {
          setNotice({
            ok: true,
            text: `Saved ${r.path}${r.loadedIntoPlayer ? ' and loaded it into the player' : ''}.`,
          })
        } else setNotice({ ok: false, text: 'Download cancelled.' })
      })
      .catch((err: unknown) => setNotice({ ok: false, text: errorText(err) }))
      .finally(() => setDownloading(null))
  }

  const toggleLanguage = (code: string) =>
    setLanguages((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : prev.length >= 5
          ? prev
          : [...prev, code],
    )

  const providerName = (id: SubtitleProviderId) => providers.find((p) => p.id === id)?.name ?? id

  return (
    <dialog
      ref={ref}
      aria-labelledby="subtitle-search-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-auto flex max-h-[88vh] w-full max-w-4xl flex-col rounded-lg border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/60"
    >
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 id="subtitle-search-title" className="text-base font-semibold">
            Find subtitles
          </h2>
          <p className="truncate text-sm text-muted" dir="auto">
            {label}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-md p-1.5 hover:bg-elevated"
        >
          <X size={16} />
        </button>
      </header>

      <form
        onSubmit={search}
        className="flex flex-col gap-3 border-b border-border px-5 py-3 text-sm"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted">Languages</span>
          {languages.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => toggleLanguage(code)}
              className="flex items-center gap-1 rounded-full border border-accent/50 px-2 py-0.5 text-xs text-accent"
              aria-label={`Remove ${SUBTITLE_LANGUAGES.find((l) => l.code === code)?.name ?? code}`}
            >
              {SUBTITLE_LANGUAGES.find((l) => l.code === code)?.name ?? code}{' '}
              <X size={12} aria-hidden />
            </button>
          ))}
          <select
            aria-label="Add language"
            value=""
            onChange={(e) => e.currentTarget.value && toggleLanguage(e.currentTarget.value)}
            className="rounded-md border border-border bg-bg px-2 py-1"
          >
            <option value="">Add…</option>
            {SUBTITLE_LANGUAGES.filter((l) => !languages.includes(l.code)).map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Title (optional)"
            placeholder="Title (optional — leave empty to use what Frame knows)"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            dir="auto"
            className="min-w-64 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 focus:border-accent focus:outline-none"
          />
          {isEpisode && (
            <>
              <input
                aria-label="Season"
                placeholder="Season"
                inputMode="numeric"
                value={season}
                onChange={(e) => setSeason(e.currentTarget.value.replace(/\D/g, '').slice(0, 3))}
                className="w-20 rounded-md border border-border bg-bg px-2 py-1.5"
              />
              <input
                aria-label="Episode"
                placeholder="Episode"
                inputMode="numeric"
                value={episode}
                onChange={(e) => setEpisode(e.currentTarget.value.replace(/\D/g, '').slice(0, 4))}
                className="w-20 rounded-md border border-border bg-bg px-2 py-1.5"
              />
            </>
          )}
          <select
            aria-label="Hearing impaired"
            value={hearingImpaired}
            onChange={(e) => setHearingImpaired(e.currentTarget.value as typeof hearingImpaired)}
            className="rounded-md border border-border bg-bg px-2 py-1.5"
          >
            <option value="include">Include SDH</option>
            <option value="exclude">No SDH</option>
            <option value="only">SDH only</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {providers.map((p) => (
            <label
              key={p.id}
              className={`flex items-center gap-1.5 ${p.configured ? '' : 'text-subtle'}`}
            >
              <input
                type="checkbox"
                disabled={!p.configured || !p.enabled}
                checked={selectedProviders.includes(p.id)}
                onChange={(e) => {
                  const on = e.currentTarget.checked
                  setSelectedProviders((prev) =>
                    on ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                  )
                }}
                className="accent-[var(--frame-accent)]"
              />
              {p.name}
              {!p.configured && <span className="text-xs">(not set up)</span>}
              {p.configured && !p.enabled && <span className="text-xs">(turned off)</span>}
            </label>
          ))}
          <button
            type="submit"
            disabled={searching || languages.length === 0 || selectedProviders.length === 0}
            className="ml-auto flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-bg hover:brightness-110 disabled:opacity-40"
          >
            {searching ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Search size={14} aria-hidden />
            )}
            Search
          </button>
        </div>
        {providers.length > 0 && providers.every((p) => !p.configured) && (
          <p className="text-xs text-muted">
            Add an API key for a provider in Settings › Subtitles to search online.
          </p>
        )}
      </form>

      <div className="min-h-40 flex-1 overflow-y-auto px-5 py-3" aria-busy={searching}>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {response?.errors.map((e) => (
          <p
            key={e.provider}
            role="alert"
            className="mb-2 text-sm text-danger"
            data-testid="provider-error"
          >
            {providerName(e.provider)}: {e.message}
          </p>
        ))}
        {notice && (
          <p
            role="status"
            data-testid="subtitle-notice"
            className={`mb-2 break-all text-sm ${notice.ok ? 'text-accent' : 'text-danger'}`}
          >
            {notice.text}
          </p>
        )}
        {response &&
          response.results.length === 0 &&
          response.errors.length < selectedProviders.length && (
            <p className="text-sm text-muted">No subtitles found. Try another language or title.</p>
          )}
        <ul aria-label="Results" className="flex flex-col gap-1.5">
          {response?.results.map((r) => (
            <li
              key={`${r.provider}-${r.id}`}
              data-testid="subtitle-result"
              className="flex items-start gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-medium">{r.languageLabel}</span>
                  <Flag>{providerName(r.provider)}</Flag>
                  {r.hashMatch && <Flag tone="accent">Exact file match</Flag>}
                  {r.hearingImpaired && <Flag>SDH</Flag>}
                  {r.forced && <Flag>Forced</Flag>}
                  {(r.machineTranslated || r.aiTranslated) && (
                    <Flag tone="warn">
                      {r.aiTranslated ? 'AI-translated' : 'Machine-translated'}
                    </Flag>
                  )}
                  {r.trustedUploader && <Flag>Trusted uploader</Flag>}
                </div>
                <div
                  className="mt-1 truncate text-xs text-text/90"
                  title={r.releaseName ?? r.fileName ?? ''}
                  dir="auto"
                >
                  {r.releaseName ?? r.fileName ?? 'No release name given'}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-subtle">
                  {r.downloads !== null && <span>{r.downloads.toLocaleString()} downloads</span>}
                  {r.ratingLabel && <span>{r.ratingLabel}</span>}
                  {r.fps && <span>{r.fps} fps</span>}
                  <span>
                    Match {Math.round(r.confidence * 100)}% (Frame’s estimate)
                    {r.reasons.length > 0 ? ` — ${r.reasons.join('; ')}` : ''}
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={downloading !== null}
                onClick={() => download(r)}
                aria-label={`Download ${r.languageLabel} subtitle from ${providerName(r.provider)}: ${r.releaseName ?? r.id}`}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-elevated disabled:opacity-40"
              >
                {downloading === r.id ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <Download size={14} aria-hidden />
                )}
                {downloading === r.id ? 'Downloading…' : 'Download'}
              </button>
            </li>
          ))}
        </ul>
        {downloading && (
          <button
            type="button"
            onClick={() => void window.frame.subtitles.cancelDownload()}
            className="mt-2 text-sm text-muted underline"
          >
            Cancel download
          </button>
        )}
      </div>

      {response && response.sent.length > 0 && (
        <details className="border-t border-border px-5 py-2 text-xs text-subtle">
          <summary className="cursor-pointer">What was sent</summary>
          <ul className="mt-1 list-disc pl-5">
            {response.sent.map((s) => (
              <li key={s.provider} className="break-all">
                {s.summary}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmDialog
        open={pendingOverwrite !== null}
        title="Replace existing subtitle?"
        confirmLabel="Replace"
        destructive
        onCancel={() => setPendingOverwrite(null)}
        onConfirm={() => {
          const pending = pendingOverwrite
          setPendingOverwrite(null)
          if (pending) download(pending.result, true)
        }}
      >
        <span className="break-all">{pendingOverwrite?.path}</span> already exists. Replace it with
        the downloaded subtitle?
      </ConfirmDialog>
    </dialog>
  )
}
