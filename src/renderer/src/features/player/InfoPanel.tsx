import type { PlayerState } from '@shared/contracts/player'
import { trackLabel } from './track-label'

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      <dt className="text-subtle">{label}</dt>
      <dd className="truncate text-text">{value ?? '—'}</dd>
    </>
  )
}

/** Diagnostics reported by mpv for the current file. Unknown values show as a dash. */
export function InfoPanel({ state }: { state: PlayerState }) {
  const { videoInfo } = state
  const resolution =
    videoInfo.width && videoInfo.height ? `${videoInfo.width} × ${videoInfo.height}` : null
  const audio = state.tracks.find((t) => t.type === 'audio' && t.selected)
  const sub = state.tracks.find((t) => t.type === 'sub' && t.selected)
  return (
    <aside
      aria-label="Playback information"
      data-testid="info-panel"
      className="absolute left-4 top-4 w-80 rounded-lg border border-border bg-surface/90 p-3 text-xs shadow-xl"
    >
      <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1">
        <Row label="File" value={state.path} />
        <Row label="Resolution" value={resolution} />
        <Row label="Video codec" value={videoInfo.videoCodec} />
        <Row label="Frame rate" value={videoInfo.fps ? `${videoInfo.fps.toFixed(3)} fps` : null} />
        <Row label="Hardware decoding" value={videoInfo.hwdec ?? 'off'} />
        <Row label="Audio codec" value={videoInfo.audioCodec} />
        <Row label="Audio track" value={audio ? trackLabel(audio) : null} />
        <Row label="Subtitles" value={sub ? trackLabel(sub) : null} />
        <Row label="Speed" value={`${state.speed}×`} />
      </dl>
    </aside>
  )
}
