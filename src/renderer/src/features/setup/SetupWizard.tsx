import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, FolderPlus } from 'lucide-react'
import { SUBTITLE_LANGUAGES } from '@shared/constants/languages'
import type { CredentialId } from '@shared/contracts/credentials'
import type { LibraryFolder } from '@shared/contracts/library'
import { builtInThemes } from '@shared/settings/theme'
import { useSettings } from '@renderer/app/settings-context'

const steps = ['Welcome', 'Library', 'TMDB', 'Subtitles', 'Theme'] as const

function errorText(e: unknown) {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)
}

/** Saves one secret to the encrypted store; the value never comes back to the page. */
function KeyField({
  id,
  label,
  onSaved,
}: {
  id: CredentialId
  label: string
  onSaved?: () => void
}) {
  const [value, setValue] = useState('')
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!value.trim()) return
        window.frame.credentials
          .set(id, value)
          .then(() => {
            setValue('')
            setState({ ok: true, text: 'Saved (encrypted)' })
            onSaved?.()
          })
          .catch((err: unknown) => setState({ ok: false, text: errorText(err) }))
      }}
    >
      <label htmlFor={`setup-${id}`} className="w-40 text-muted">
        {label}
      </label>
      <input
        id={`setup-${id}`}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        className="min-w-48 flex-1 rounded-md border border-border bg-bg px-2 py-1.5 font-mono"
      />
      <button
        type="submit"
        aria-label={`Save ${label}`}
        className="rounded-md border border-border px-3 py-1.5 hover:bg-elevated"
      >
        Save
      </button>
      {state && (
        <span
          role="status"
          className={`w-full pl-[10.5rem] text-xs ${state.ok ? 'text-muted' : 'text-danger'}`}
        >
          {state.text}
        </span>
      )}
    </form>
  )
}

function LibraryStep() {
  const [folders, setFolders] = useState<LibraryFolder[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    window.frame.library
      .listFolders()
      .then(setFolders)
      .catch(() => undefined)
    return window.frame.library.onChanged(() => {
      window.frame.library
        .listFolders()
        .then(setFolders)
        .catch(() => undefined)
    })
  }, [])
  return (
    <>
      <p>
        Add the folders where your movies and shows are. Frame scans them in the background and
        never changes or moves your files.
      </p>
      <ul className="flex flex-col gap-1" data-testid="setup-folders">
        {folders.map((f) => (
          <li key={f.id} className="truncate rounded-md bg-bg px-3 py-1.5" title={f.path}>
            {f.path}
          </li>
        ))}
      </ul>
      <div>
        <button
          type="button"
          onClick={() => {
            window.frame.library
              .addFolderDialog()
              .then((r) => {
                if (r?.error) setError(r.error)
                else if (r?.folder) setFolders((all) => [...all, r.folder as LibraryFolder])
              })
              .catch((e: unknown) => setError(errorText(e)))
          }}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 hover:bg-elevated"
        >
          <FolderPlus size={16} aria-hidden /> Add folder…
        </button>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </>
  )
}

function TmdbStep() {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  return (
    <>
      <p>
        Optional. With a free TMDB account, Frame shows posters, descriptions and cast. Create an
        API Read Access Token at themoviedb.org → Settings → API, then paste it here.
      </p>
      <KeyField
        id="tmdb.accessToken"
        label="TMDB token"
        onSaved={() => {
          window.frame.metadata
            .testToken()
            .then(setResult)
            .catch((e: unknown) => setResult({ ok: false, message: errorText(e) }))
        }}
      />
      {result && (
        <p
          role="status"
          data-testid="setup-tmdb-result"
          className={result.ok ? 'text-muted' : 'text-danger'}
        >
          {result.message}
        </p>
      )}
      <p className="text-xs text-subtle">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </>
  )
}

function SubtitlesStep() {
  const { settings, update } = useSettings()
  if (!settings) return null
  const langs = settings.subtitles.preferredLanguages
  const name = (code: string) => SUBTITLE_LANGUAGES.find((l) => l.code === code)?.name ?? code
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-muted">Preferred subtitle languages, in order</span>
        <div className="flex flex-wrap gap-1.5">
          {langs.map((code) => (
            <span key={code} className="flex items-center gap-1 rounded-md bg-bg px-2 py-1">
              {name(code)}
              {langs.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove ${name(code)}`}
                  onClick={() =>
                    update({ subtitles: { preferredLanguages: langs.filter((l) => l !== code) } })
                  }
                  className="text-subtle hover:text-danger"
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {langs.length < 5 && (
            <select
              aria-label="Add subtitle language"
              value=""
              onChange={(e) => {
                const code = e.currentTarget.value
                if (code) update({ subtitles: { preferredLanguages: [...langs, code] } })
              }}
              className="rounded-md border border-border bg-bg px-2 py-1"
            >
              <option value="">Add…</option>
              {SUBTITLE_LANGUAGES.filter((l) => !langs.includes(l.code)).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <p>
        Optional: to search subtitles online, add keys from your own accounts. Subtitle files next
        to your videos work without them.
      </p>
      <KeyField id="opensubtitles.apiKey" label="OpenSubtitles key" />
      <KeyField id="subsource.apiKey" label="SubSource key" />
    </>
  )
}

function ThemeStep() {
  const { settings, update } = useSettings()
  if (!settings) return null
  return (
    <div className="flex flex-wrap gap-3" role="group" aria-label="Themes">
      {builtInThemes.map((t) => {
        const active = settings.appearance.themeId === t.id
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={active}
            onClick={() => update({ appearance: { themeId: t.id } })}
            className={`flex w-32 flex-col overflow-hidden rounded-md border text-left text-xs ${
              active ? 'border-accent ring-1 ring-accent' : 'border-border'
            }`}
          >
            <span className="flex h-10 items-end gap-1 p-2" style={{ background: t.colors.bg }}>
              <span className="h-1.5 w-10 rounded" style={{ background: t.colors.text }} />
              <span className="h-1.5 w-5 rounded" style={{ background: t.colors.accent }} />
            </span>
            <span className="flex items-center gap-1 bg-surface px-2 py-1">
              {active && <Check size={12} className="text-accent" aria-hidden />}
              {t.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Optional first-run steps. Every step can be skipped; all of it is in Settings later. */
export function SetupWizard({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [step, setStep] = useState(0)
  const { update, flush } = useSettings()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const finish = () => {
    update({ general: { setupComplete: true } })
    void flush().finally(onDone)
  }

  const content: Record<(typeof steps)[number], ReactNode> = {
    Welcome: (
      <>
        <p>
          Frame plays the videos on your computer right away — nothing here is required. The next
          steps set up your library, optional online information and subtitles, and a theme.
        </p>
        <p className="text-muted">You can skip any step and change everything later in Settings.</p>
      </>
    ),
    Library: <LibraryStep />,
    TMDB: <TmdbStep />,
    Subtitles: <SubtitlesStep />,
    Theme: <ThemeStep />,
  }
  const name = steps[step] ?? 'Welcome'
  const last = step === steps.length - 1

  return (
    <dialog
      ref={ref}
      aria-label="Set up Frame"
      onCancel={(e) => {
        e.preventDefault()
        finish()
      }}
      className="m-auto w-full max-w-xl rounded-lg border border-border bg-surface p-0 text-sm text-text shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-4 p-6">
        <ol className="flex gap-1" aria-label="Steps">
          {steps.map((s, i) => (
            <li
              key={s}
              aria-current={i === step ? 'step' : undefined}
              className={`h-1 flex-1 rounded ${i <= step ? 'bg-accent' : 'bg-elevated'}`}
            >
              <span className="sr-only">{s}</span>
            </li>
          ))}
        </ol>
        <h2 className="text-lg font-semibold">
          {step === 0 ? 'Welcome to Frame' : name}
          <span className="ml-2 text-xs font-normal text-subtle">
            Step {step + 1} of {steps.length}
          </span>
        </h2>
        <div className="flex flex-col gap-3">{content[name]}</div>
      </div>
      <div className="flex items-center gap-2 border-t border-border px-6 py-3">
        <button
          type="button"
          onClick={finish}
          className="rounded-md px-3 py-1.5 text-muted hover:bg-elevated"
        >
          Skip setup
        </button>
        <div className="ml-auto flex gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="rounded-md border border-border px-3 py-1.5 hover:bg-elevated"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? finish() : setStep(step + 1))}
            className="rounded-md bg-accent px-4 py-1.5 font-medium text-bg"
          >
            {last ? 'Finish' : step === 0 ? 'Start' : 'Next'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
