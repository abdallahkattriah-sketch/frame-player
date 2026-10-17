import { Gauge, Languages, Minus, Plus, RectangleHorizontal } from 'lucide-react'
import {
  aspectRatioOptions,
  type PlayerState,
  type PlayerTrack,
  type VideoScaling,
} from '@shared/contracts/player'
import { MenuOption, MenuSection, Popover } from '@renderer/components/ui/Popover'
import { sendCommand } from './send-command'
import { formatDelay, trackLabel } from './track-label'

const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const DELAY_STEP = 0.1

function DelayControl({
  label,
  seconds,
  onChange,
}: {
  label: string
  seconds: number
  onChange: (seconds: number) => void
}) {
  const step = (delta: number) => onChange(Math.round((seconds + delta) * 1000) / 1000)
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span className="flex-1 text-muted">{label}</span>
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        onClick={() => step(-DELAY_STEP)}
        className="rounded p-1 hover:bg-elevated"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        aria-label={`Reset ${label.toLowerCase()}`}
        onClick={() => onChange(0)}
        className="w-20 rounded px-1 text-center tabular-nums hover:bg-elevated"
      >
        {formatDelay(seconds)}
      </button>
      <button
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        onClick={() => step(DELAY_STEP)}
        className="rounded p-1 hover:bg-elevated"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

function TrackOptions({
  tracks,
  onSelect,
}: {
  tracks: PlayerTrack[]
  onSelect: (id: number | 'none') => void
}) {
  const noneSelected = !tracks.some((t) => t.selected)
  return (
    <>
      <MenuOption checked={noneSelected} onSelect={() => onSelect('none')}>
        Off
      </MenuOption>
      {tracks.map((track) => (
        <MenuOption key={track.id} checked={track.selected} onSelect={() => onSelect(track.id)}>
          {trackLabel(track)}
        </MenuOption>
      ))}
    </>
  )
}

export function AudioSubtitleMenu({
  state,
  onSearchOnline,
  onLoadFile,
  onOpenStyle,
}: {
  state: PlayerState
  onSearchOnline?: () => void
  onLoadFile?: () => void
  onOpenStyle?: () => void
}) {
  const audio = state.tracks.filter((t) => t.type === 'audio')
  const subs = state.tracks.filter((t) => t.type === 'sub')
  return (
    <Popover label="Audio and subtitles" trigger={<Languages size={18} />} className="w-72">
      <div role="menu" className="max-h-96 overflow-y-auto">
        <MenuSection title="Audio">
          {audio.length === 0 ? (
            <div className="px-2 py-1.5 text-muted">No audio tracks</div>
          ) : (
            <TrackOptions
              tracks={audio}
              onSelect={(id) => sendCommand({ type: 'set-audio-track', id })}
            />
          )}
          <DelayControl
            label="Audio delay"
            seconds={state.audioDelay}
            onChange={(seconds) => sendCommand({ type: 'set-audio-delay', seconds })}
          />
        </MenuSection>
        <MenuSection title="Subtitles">
          {subs.length === 0 ? (
            <div className="px-2 py-1.5 text-muted">No subtitle tracks</div>
          ) : (
            <TrackOptions
              tracks={subs}
              onSelect={(id) => sendCommand({ type: 'set-subtitle-track', id })}
            />
          )}
          <DelayControl
            label="Subtitle delay"
            seconds={state.subtitleDelay}
            onChange={(seconds) => sendCommand({ type: 'set-subtitle-delay', seconds })}
          />
          {(onSearchOnline ?? onLoadFile) && (
            <div className="mt-1 flex gap-1 px-1">
              {onSearchOnline && (
                <button
                  type="button"
                  onClick={onSearchOnline}
                  className="flex-1 rounded-md border border-border px-2 py-1.5 hover:bg-elevated"
                >
                  Search online…
                </button>
              )}
              {onLoadFile && (
                <button
                  type="button"
                  onClick={onLoadFile}
                  className="flex-1 rounded-md border border-border px-2 py-1.5 hover:bg-elevated"
                >
                  Load file…
                </button>
              )}
            </div>
          )}
          {onOpenStyle && (
            <div className="mt-1 px-1">
              <button
                type="button"
                onClick={onOpenStyle}
                className="w-full rounded-md border border-border px-2 py-1.5 hover:bg-elevated"
              >
                Subtitle style…
              </button>
            </div>
          )}
        </MenuSection>
      </div>
    </Popover>
  )
}

export function SpeedMenu({ speed }: { speed: number }) {
  return (
    <Popover label={`Playback speed (${speed}×)`} trigger={<Gauge size={18} />}>
      <div role="menu">
        <MenuSection title="Speed">
          {speeds.map((s) => (
            <MenuOption
              key={s}
              checked={Math.abs(speed - s) < 0.001}
              onSelect={() => sendCommand({ type: 'set-speed', speed: s })}
            >
              {s === 1 ? 'Normal' : `${s}×`}
            </MenuOption>
          ))}
          {!speeds.some((s) => Math.abs(speed - s) < 0.001) && (
            <MenuOption checked onSelect={() => undefined}>
              {`${speed}×`}
            </MenuOption>
          )}
        </MenuSection>
      </div>
    </Popover>
  )
}

const scalingLabels: Record<VideoScaling, string> = {
  fit: 'Fit to window',
  fill: 'Fill (crop)',
  stretch: 'Stretch',
}

export function VideoMenu({ state }: { state: PlayerState }) {
  return (
    <Popover label="Video options" trigger={<RectangleHorizontal size={18} />}>
      <div role="menu">
        <MenuSection title="Aspect ratio">
          {aspectRatioOptions.map((aspect) => (
            <MenuOption
              key={aspect}
              checked={state.aspectRatio === aspect}
              onSelect={() => sendCommand({ type: 'set-aspect-ratio', aspect })}
            >
              {aspect === 'auto' ? 'Original' : aspect}
            </MenuOption>
          ))}
        </MenuSection>
        <MenuSection title="Scaling">
          {(Object.keys(scalingLabels) as VideoScaling[]).map((scaling) => (
            <MenuOption
              key={scaling}
              checked={state.scaling === scaling}
              onSelect={() => sendCommand({ type: 'set-scaling', scaling })}
            >
              {scalingLabels[scaling]}
            </MenuOption>
          ))}
        </MenuSection>
      </div>
    </Popover>
  )
}
