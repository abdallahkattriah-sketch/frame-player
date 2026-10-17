import { X } from 'lucide-react'
import { SubtitleStudio } from '@renderer/features/subtitles/SubtitleStudio'
import { useSubtitleAppearance } from '@renderer/features/subtitles/use-subtitle-appearance'

/** Subtitle Studio beside the video: the playing video is the live preview. */
export function SubtitleStylePanel({ onClose }: { onClose: () => void }) {
  const { appearance, change, error } = useSubtitleAppearance()
  return (
    <aside
      aria-label="Subtitle style"
      className="absolute bottom-28 right-4 top-4 flex w-[26rem] flex-col rounded-lg border border-border bg-surface/95 shadow-xl"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <header className="flex items-center gap-1 border-b border-border px-3 py-2">
        <h2 className="flex-1 text-sm font-medium">Subtitle style</h2>
        <button
          type="button"
          aria-label="Close subtitle style"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-text"
        >
          <X size={16} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {appearance && <SubtitleStudio appearance={appearance} onChange={change} />}
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </aside>
  )
}
