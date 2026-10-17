import { useState, type ReactNode } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import {
  builtInThemes,
  contrastWarnings,
  defaultAppearance,
  findTheme,
  themeColorKeys,
  themeColorLabels,
  type AppearanceSettings,
  type Theme,
  type ThemeColorKey,
} from '@shared/settings/theme'
import { useSettings } from '@renderer/app/settings-context'

const HEX = /^#[0-9A-Fa-f]{6}$/

const newThemeId = () => `custom-${Date.now().toString(36)}`

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-44 shrink-0 text-muted">{label}</span>
      {children}
    </label>
  )
}

function ThemeSwatch({
  theme,
  active,
  onSelect,
}: {
  theme: Theme
  active: boolean
  onSelect: () => void
}) {
  const c = theme.colors
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`Use theme ${theme.name}`}
      onClick={onSelect}
      className={`flex w-36 flex-col overflow-hidden rounded-md border text-left text-xs ${
        active ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-subtle'
      }`}
    >
      <span className="flex h-12" style={{ background: c.bg }}>
        <span className="w-8" style={{ background: c.surface }} />
        <span className="flex flex-1 flex-col justify-center gap-1 px-2">
          <span className="h-1.5 w-12 rounded" style={{ background: c.text }} />
          <span className="h-1.5 w-8 rounded" style={{ background: c.textMuted }} />
          <span className="h-1.5 w-6 rounded" style={{ background: c.accent }} />
        </span>
      </span>
      <span className="flex items-center gap-1 bg-surface px-2 py-1">
        {active && <Check size={12} className="text-accent" aria-hidden />}
        <span className="truncate">{theme.name}</span>
      </span>
    </button>
  )
}

/** Color picker plus a hex text field; invalid hex is shown, not saved. */
function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }
  const valid = HEX.test(draft)
  return (
    <div className="flex items-center gap-2">
      <span className="w-44 shrink-0 text-muted">{label}</span>
      <input
        type="color"
        aria-label={`${label} color`}
        value={value.toLowerCase()}
        onChange={(e) => onChange(e.currentTarget.value.toUpperCase())}
        className="h-7 w-10 cursor-pointer rounded border border-border bg-bg"
      />
      <input
        aria-label={`${label} hex`}
        aria-invalid={!valid}
        value={draft}
        maxLength={7}
        spellCheck={false}
        onChange={(e) => {
          const next = e.currentTarget.value.trim()
          setDraft(next)
          if (HEX.test(next)) onChange(next.toUpperCase())
        }}
        className={`w-24 rounded-md border bg-bg px-2 py-1 font-mono text-xs ${
          valid ? 'border-border' : 'border-danger'
        }`}
      />
      {!valid && <span className="text-xs text-danger">Use #RRGGBB</span>}
    </div>
  )
}

export function AppearanceSection() {
  const { settings, update, flush, error } = useSettings()
  const [message, setMessage] = useState<string | null>(null)
  if (!settings) return null
  const a = settings.appearance
  const theme = findTheme(a)
  const isCustom = a.customThemes.some((t) => t.id === theme.id)
  const set = (patch: Partial<AppearanceSettings>) => update({ appearance: patch })
  const colors = { ...theme.colors, accent: a.accentOverride ?? theme.colors.accent }
  const warnings = contrastWarnings(colors)

  const editTheme = (patch: Partial<Pick<Theme, 'name' | 'colors'>>) =>
    set({
      customThemes: a.customThemes.map((t) =>
        t.id === theme.id ? { ...t, ...patch, colors: { ...t.colors, ...patch.colors } } : t,
      ),
    })

  const customize = () => {
    if (a.customThemes.length >= 30) {
      setMessage('Delete a custom theme first (30 at most).')
      return
    }
    const copy: Theme = {
      id: newThemeId(),
      name: `${theme.name} (custom)`.slice(0, 60),
      colors: { ...theme.colors },
    }
    set({ customThemes: [...a.customThemes, copy], themeId: copy.id })
  }

  return (
    <section aria-labelledby="appearance-heading" className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1">
          <h2 id="appearance-heading" className="text-lg font-semibold">
            Theme Studio
          </h2>
          <p className="text-sm text-muted">Changes apply to every Frame window immediately.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            flush()
              .then(() => window.frame.themes.importFile())
              .then((r) => setMessage(r.error ?? (r.theme ? `Imported “${r.theme.name}”.` : null)))
              .catch((e: unknown) => setMessage(String(e)))
          }}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-elevated"
        >
          Import theme…
        </button>
        <button
          type="button"
          onClick={() => {
            flush()
              .then(() => window.frame.themes.exportFile(theme.id))
              .then((saved) => setMessage(saved ? `Exported “${theme.name}”.` : null))
              .catch((e: unknown) => setMessage(String(e)))
          }}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-elevated"
        >
          Export theme…
        </button>
      </div>
      {(message ?? error) && (
        <p role="status" className="text-sm text-muted" data-testid="theme-message">
          {message ?? error}
        </p>
      )}

      <div className="flex flex-wrap gap-3" role="group" aria-label="Themes">
        {[...builtInThemes, ...a.customThemes].map((t) => (
          <ThemeSwatch
            key={t.id}
            theme={t}
            active={t.id === theme.id}
            onSelect={() => set({ themeId: t.id })}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 text-sm">
        {isCustom ? (
          <>
            <Field label="Theme name">
              <input
                key={`${theme.id}-${theme.name}`}
                aria-label="Theme name"
                defaultValue={theme.name}
                maxLength={60}
                onBlur={(e) => {
                  const name = e.currentTarget.value.trim()
                  if (name && name !== theme.name) editTheme({ name })
                }}
                className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1"
              />
            </Field>
            {themeColorKeys.map((key: ThemeColorKey) => (
              <ColorRow
                key={key}
                label={themeColorLabels[key]}
                value={theme.colors[key]}
                onChange={(hex) => editTheme({ colors: { ...theme.colors, [key]: hex } })}
              />
            ))}
            <div className="flex gap-2 pl-[11.5rem]">
              <button
                type="button"
                onClick={() => editTheme({ colors: { ...(builtInThemes[0] as Theme).colors } })}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-elevated"
              >
                Reset colors to Midnight Cinema
              </button>
              <button
                type="button"
                onClick={() =>
                  set({
                    customThemes: a.customThemes.filter((t) => t.id !== theme.id),
                    themeId: defaultAppearance.themeId,
                  })
                }
                className="rounded-md border border-border px-3 py-1.5 text-danger hover:bg-elevated"
              >
                Delete theme
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-muted">Built-in themes can’t be edited.</span>
            <button
              type="button"
              onClick={customize}
              className="rounded-md border border-border px-3 py-1.5 hover:bg-elevated"
            >
              Customize a copy
            </button>
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-md border border-danger/40 px-3 py-2 text-sm"
        >
          <span className="flex items-center gap-1.5 font-medium">
            <AlertTriangle size={14} className="text-danger" aria-hidden /> Some text may be hard to
            read
          </span>
          {warnings.map((w) => (
            <span key={w.pair} className="text-muted">
              {w.pair}: contrast {w.ratio.toFixed(1)}:1 (at least {w.minimum}:1 recommended)
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 text-sm">
        <h3 className="text-xs font-medium uppercase tracking-wide text-subtle">Accent</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={a.accentOverride !== null}
            onChange={(e) =>
              set({ accentOverride: e.currentTarget.checked ? theme.colors.accent : null })
            }
            className="accent-[var(--frame-accent)]"
          />
          Use my own accent color with every theme
        </label>
        {a.accentOverride !== null && (
          <ColorRow
            label="Accent color"
            value={a.accentOverride}
            onChange={(accentOverride) => set({ accentOverride })}
          />
        )}

        <h3 className="mt-2 text-xs font-medium uppercase tracking-wide text-subtle">
          Text and layout
        </h3>
        <Field label="Font">
          <select
            value={a.fontFamily}
            onChange={(e) =>
              set({ fontFamily: e.currentTarget.value as AppearanceSettings['fontFamily'] })
            }
            className="rounded-md border border-border bg-bg px-2 py-1"
          >
            <option value="segoe-variable">Segoe UI Variable (default)</option>
            <option value="segoe">Segoe UI</option>
            <option value="tahoma">Tahoma</option>
            <option value="arial">Arial</option>
          </select>
        </Field>
        <Field label="Text size">
          <input
            type="range"
            aria-label="Text size"
            min={0.85}
            max={1.3}
            step={0.05}
            value={a.fontScale}
            onChange={(e) => set({ fontScale: Number(e.currentTarget.value) })}
            className="flex-1 accent-[var(--frame-accent)]"
          />
          <span className="w-12 text-right tabular-nums text-subtle">
            {Math.round(a.fontScale * 100)}%
          </span>
        </Field>
        <Field label="Density">
          <select
            value={a.density}
            onChange={(e) =>
              set({ density: e.currentTarget.value as AppearanceSettings['density'] })
            }
            className="rounded-md border border-border bg-bg px-2 py-1"
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="spacious">Spacious</option>
          </select>
        </Field>
        <Field label="Sidebar width">
          <input
            type="range"
            aria-label="Sidebar width"
            min={180}
            max={320}
            step={10}
            value={a.sidebarWidth}
            onChange={(e) => set({ sidebarWidth: Number(e.currentTarget.value) })}
            className="flex-1 accent-[var(--frame-accent)]"
          />
          <span className="w-12 text-right tabular-nums text-subtle">{a.sidebarWidth}px</span>
        </Field>
        <Field label="Poster size">
          <select
            value={a.posterSize}
            onChange={(e) =>
              set({ posterSize: e.currentTarget.value as AppearanceSettings['posterSize'] })
            }
            className="rounded-md border border-border bg-bg px-2 py-1"
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </Field>
        <Field label="Animations">
          <select
            value={a.animations}
            onChange={(e) =>
              set({ animations: e.currentTarget.value as AppearanceSettings['animations'] })
            }
            className="rounded-md border border-border bg-bg px-2 py-1"
          >
            <option value="full">Full</option>
            <option value="reduced">Reduced</option>
            <option value="off">Off</option>
          </select>
        </Field>
        <Field label="Player controls">
          <select
            value={a.playerControls}
            onChange={(e) =>
              set({ playerControls: e.currentTarget.value as AppearanceSettings['playerControls'] })
            }
            className="rounded-md border border-border bg-bg px-2 py-1"
          >
            <option value="auto-hide">Hide while playing</option>
            <option value="always">Always visible</option>
          </select>
        </Field>
        <div>
          <button
            type="button"
            onClick={() => {
              const { customThemes: _keep, ...defaults } = defaultAppearance
              set(defaults)
            }}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-elevated"
          >
            Reset appearance to defaults
          </button>
        </div>
      </div>
    </section>
  )
}
