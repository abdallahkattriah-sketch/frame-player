import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/settings/schema'

type PlaybackSettings = AppSettings['playback']

function errorText(e: unknown) {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)
}

export function NumberSetting({
  label,
  value,
  min,
  max,
  suffix,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  suffix: string
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const commit = () => {
    const n = Math.round(Number(draft))
    if (Number.isFinite(n) && n >= min && n <= max) {
      if (n !== value) onCommit(n)
    } else {
      setDraft(String(value))
    }
  }
  return (
    <label className="flex items-center gap-2">
      <span className="w-56 text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
        className="w-20 rounded-md border border-border bg-bg px-2 py-1 tabular-nums focus:border-accent focus:outline-none"
      />
      <span className="text-subtle">{suffix}</span>
    </label>
  )
}

export function PlaybackSection() {
  const [settings, setSettings] = useState<PlaybackSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.frame.settings.get().then((s) => setSettings(s.playback))
    // Audio settings and resets change the same section.
    return window.frame.settings.onChanged((s) => setSettings(s.playback))
  }, [])

  /** Applies immediately, saves, and reverts on failure. */
  const update = (patch: Partial<PlaybackSettings>) => {
    const previous = settings
    if (previous) setSettings({ ...previous, ...patch })
    window.frame.settings
      .update({ playback: patch })
      .then((s) => {
        setSettings(s.playback)
        setError(null)
      })
      .catch((e: unknown) => {
        setSettings(previous)
        setError(errorText(e))
      })
  }

  if (!settings) return null

  return (
    <section aria-labelledby="playback-heading" className="flex max-w-3xl flex-col gap-4">
      <h2 id="playback-heading" className="text-lg font-semibold">
        Playback
      </h2>
      <div className="flex flex-col gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.resumePlayback}
            onChange={(e) => update({ resumePlayback: e.currentTarget.checked })}
            className="accent-[var(--frame-accent)]"
          />
          Resume videos where you left off
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.timelinePreviews}
            onChange={(e) => update({ timelinePreviews: e.currentTarget.checked })}
            className="accent-[var(--frame-accent)]"
          />
          Show preview images when hovering the timeline
        </label>
        <NumberSetting
          label="Seek step (arrow keys)"
          value={settings.seekStepSeconds}
          min={1}
          max={300}
          suffix="seconds"
          onCommit={(seekStepSeconds) => update({ seekStepSeconds })}
        />
        <NumberSetting
          label="Count as watched after"
          value={settings.completionThresholdPercent}
          min={50}
          max={100}
          suffix="% of the video"
          onCommit={(completionThresholdPercent) => update({ completionThresholdPercent })}
        />
        <label className="flex items-center gap-2">
          <span className="w-56 text-muted">Hardware decoding</span>
          <select
            value={settings.hardwareDecoding}
            onChange={(e) =>
              update({
                hardwareDecoding: e.currentTarget.value as PlaybackSettings['hardwareDecoding'],
              })
            }
            className="rounded-md border border-border bg-bg px-2 py-1"
          >
            <option value="auto-safe">Automatic (recommended)</option>
            <option value="auto">Always try</option>
            <option value="no">Off</option>
          </select>
        </label>
        <p className="text-xs text-subtle">
          Hardware decoding applies the next time the player opens.
        </p>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
