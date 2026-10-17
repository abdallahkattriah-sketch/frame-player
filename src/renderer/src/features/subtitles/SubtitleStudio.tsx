import type { ReactNode } from 'react'
import { Copy, RotateCcw, Trash2 } from 'lucide-react'
import {
  activeSubtitleStyle,
  type SubtitleAppearance,
  type SubtitleStyle,
} from '@shared/settings/subtitle-style'
import {
  deleteActiveProfile,
  duplicateActiveProfile,
  newProfileId,
  renameActiveProfile,
  resetActiveProfile,
  updateActiveStyle,
} from './subtitle-profiles'

/** Fonts that ship with Windows; any installed font name can be typed. */
const COMMON_FONTS = [
  'Segoe UI',
  'Arial',
  'Tahoma',
  'Calibri',
  'Verdana',
  'Trebuchet MS',
  'Georgia',
  'Times New Roman',
  'Sakkal Majalla',
  'Traditional Arabic',
  'Yu Gothic',
  'Consolas',
]

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-36 shrink-0 text-muted">{label}</span>
      {children}
    </label>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format = (v) => String(v),
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <Row label={label}>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="min-w-0 flex-1 accent-[var(--frame-accent)]"
      />
      <span className="w-12 text-right tabular-nums text-subtle">{format(value)}</span>
    </Row>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Row label={label}>
      <input
        type="color"
        aria-label={label}
        value={value.toLowerCase()}
        onChange={(e) => onChange(e.currentTarget.value.toUpperCase())}
        className="h-7 w-12 cursor-pointer rounded border border-border bg-bg"
      />
    </Row>
  )
}

const hexToRgba = (hex: string, opacity: number) => {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity / 100})`
}

/**
 * CSS approximation of mpv's rendering, for when no video is playing. The playing video
 * shows the exact result: changes are applied to it immediately.
 */
export function SubtitlePreview({ style }: { style: SubtitleStyle }) {
  const height = 180
  // mpv sizes are relative to a 720-pixel-high video.
  const px = (v: number) => (v * height) / 720
  const outline = px(style.outlineSize)
  const shadow =
    style.background === 'none' && style.shadowOffset > 0
      ? `${px(style.shadowOffset)}px ${px(style.shadowOffset)}px 0 ${hexToRgba(style.shadowColor, style.shadowOpacity)}`
      : ''
  return (
    <div
      data-testid="subtitle-preview"
      className="relative overflow-hidden rounded-md border border-border"
      style={{ height, background: 'linear-gradient(135deg, #3a4a5c, #1f2630 60%, #46392c)' }}
    >
      <div
        className="absolute inset-x-0 flex flex-col items-center"
        style={{ bottom: `${100 - style.position + (px(style.marginY) / height) * 100}%` }}
      >
        {['مرحبا بكم في Frame', 'Subtitles look like this'].map((line) => (
          <span
            key={line}
            dir="auto"
            style={{
              fontFamily: `"${style.font}", sans-serif`,
              fontSize: px(style.fontSize * style.scale),
              fontWeight: style.bold ? 700 : 400,
              fontStyle: style.italic ? 'italic' : 'normal',
              color: style.textColor,
              WebkitTextStroke: outline > 0 ? `${outline * 2}px ${style.outlineColor}` : undefined,
              paintOrder: 'stroke fill',
              textShadow: shadow,
              background:
                style.background === 'box'
                  ? hexToRgba(style.backgroundColor, style.backgroundOpacity)
                  : undefined,
              padding: style.background === 'box' ? '0 0.25em' : undefined,
              lineHeight: 1.25,
            }}
          >
            {line}
          </span>
        ))}
      </div>
    </div>
  )
}

interface SubtitleStudioProps {
  appearance: SubtitleAppearance
  onChange: (next: SubtitleAppearance) => void
}

/** Profile picker and style controls. Every control maps to an mpv subtitle option. */
export function SubtitleStudio({ appearance, onChange }: SubtitleStudioProps) {
  const style = activeSubtitleStyle(appearance)
  const active = appearance.profiles.find((p) => p.id === appearance.activeProfileId)
  const set = (patch: Partial<SubtitleStyle>) => onChange(updateActiveStyle(appearance, patch))

  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="subtitle-studio">
      <div className="flex flex-wrap items-center gap-2">
        <Row label="Profile">
          <select
            aria-label="Subtitle profile"
            value={appearance.activeProfileId}
            onChange={(e) => onChange({ ...appearance, activeProfileId: e.currentTarget.value })}
            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1"
          >
            {appearance.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Row>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            title="Save as a new profile"
            aria-label="Duplicate profile"
            disabled={appearance.profiles.length >= 30}
            onClick={() =>
              onChange(
                duplicateActiveProfile(
                  appearance,
                  `Copy of ${active?.name ?? 'profile'}`,
                  newProfileId(),
                ),
              )
            }
            className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-text disabled:opacity-40"
          >
            <Copy size={15} />
          </button>
          <button
            type="button"
            title="Reset this profile to its defaults"
            aria-label="Reset profile to defaults"
            onClick={() => onChange(resetActiveProfile(appearance))}
            className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-text"
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            title="Delete this profile"
            aria-label="Delete profile"
            disabled={appearance.profiles.length <= 1}
            onClick={() => onChange(deleteActiveProfile(appearance))}
            className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-danger disabled:opacity-40"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <Row label="Profile name">
        <input
          key={`${appearance.activeProfileId}-${active?.name ?? ''}`}
          aria-label="Profile name"
          defaultValue={active?.name}
          maxLength={60}
          onBlur={(e) => onChange(renameActiveProfile(appearance, e.currentTarget.value))}
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1"
        />
      </Row>

      <Row label="Font">
        <input
          key={`font-${appearance.activeProfileId}-${style.font}`}
          aria-label="Font"
          list="subtitle-fonts"
          defaultValue={style.font}
          maxLength={100}
          onBlur={(e) => {
            const font = e.currentTarget.value.trim()
            if (font && font !== style.font) set({ font })
          }}
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1"
        />
        <datalist id="subtitle-fonts">
          {COMMON_FONTS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </Row>
      <Slider
        label="Font size"
        value={style.fontSize}
        min={10}
        max={120}
        step={1}
        onChange={(fontSize) => set({ fontSize })}
      />
      <Slider
        label="Scale"
        value={style.scale}
        min={0.5}
        max={3}
        step={0.05}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(scale) => set({ scale })}
      />
      <div className="flex gap-4 pl-[9.5rem]">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={style.bold}
            onChange={(e) => set({ bold: e.currentTarget.checked })}
            className="accent-[var(--frame-accent)]"
          />
          Bold
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={style.italic}
            onChange={(e) => set({ italic: e.currentTarget.checked })}
            className="accent-[var(--frame-accent)]"
          />
          Italic
        </label>
      </div>
      <ColorField
        label="Text color"
        value={style.textColor}
        onChange={(textColor) => set({ textColor })}
      />
      <ColorField
        label="Outline color"
        value={style.outlineColor}
        onChange={(outlineColor) => set({ outlineColor })}
      />
      <Slider
        label="Outline thickness"
        value={style.outlineSize}
        min={0}
        max={10}
        step={0.1}
        format={(v) => v.toFixed(1)}
        onChange={(outlineSize) => set({ outlineSize })}
      />
      <Row label="Background">
        <select
          aria-label="Background"
          value={style.background}
          onChange={(e) =>
            set({ background: e.currentTarget.value as SubtitleStyle['background'] })
          }
          className="rounded-md border border-border bg-bg px-2 py-1"
        >
          <option value="none">None (outline and shadow)</option>
          <option value="box">Box behind text</option>
        </select>
      </Row>
      {style.background === 'box' ? (
        <>
          <ColorField
            label="Box color"
            value={style.backgroundColor}
            onChange={(backgroundColor) => set({ backgroundColor })}
          />
          <Slider
            label="Box opacity"
            value={style.backgroundOpacity}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(backgroundOpacity) => set({ backgroundOpacity })}
          />
        </>
      ) : (
        <>
          <Slider
            label="Shadow distance"
            value={style.shadowOffset}
            min={0}
            max={10}
            step={0.5}
            format={(v) => v.toFixed(1)}
            onChange={(shadowOffset) => set({ shadowOffset })}
          />
          {style.shadowOffset > 0 && (
            <>
              <ColorField
                label="Shadow color"
                value={style.shadowColor}
                onChange={(shadowColor) => set({ shadowColor })}
              />
              <Slider
                label="Shadow opacity"
                value={style.shadowOpacity}
                min={0}
                max={100}
                step={1}
                format={(v) => `${v}%`}
                onChange={(shadowOpacity) => set({ shadowOpacity })}
              />
            </>
          )}
        </>
      )}
      <Slider
        label="Vertical position"
        value={style.position}
        min={0}
        max={150}
        step={1}
        format={(v) => (v === 100 ? 'bottom' : String(v))}
        onChange={(position) => set({ position })}
      />
      <Slider
        label="Bottom margin"
        value={style.marginY}
        min={0}
        max={200}
        step={1}
        onChange={(marginY) => set({ marginY })}
      />
      <Row label="Styled subtitles">
        <select
          aria-label="Styled subtitles"
          value={style.styledSubtitles}
          onChange={(e) =>
            set({ styledSubtitles: e.currentTarget.value as SubtitleStyle['styledSubtitles'] })
          }
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1"
        >
          <option value="keep">Keep their own style</option>
          <option value="scale">Keep their style, apply scale</option>
          <option value="override">Replace with this style</option>
        </select>
      </Row>
      <p className="text-xs text-subtle">
        Styled subtitles (.ass, common for anime) carry their own fonts and positions. Changing the
        appearance never modifies subtitle files.
      </p>
    </div>
  )
}
