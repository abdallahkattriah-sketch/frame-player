import { activeSubtitleStyle } from '@shared/settings/subtitle-style'
import { SubtitlePreview, SubtitleStudio } from '@renderer/features/subtitles/SubtitleStudio'
import { useSubtitleAppearance } from '@renderer/features/subtitles/use-subtitle-appearance'

export function SubtitleAppearanceSection() {
  const { appearance, change, error } = useSubtitleAppearance()
  if (!appearance) return null
  return (
    <section aria-labelledby="subtitle-style-heading" className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 id="subtitle-style-heading" className="text-lg font-semibold">
          Subtitle Studio
        </h2>
        <p className="text-sm text-muted">
          Choose how subtitles look. The preview is approximate; while a video plays, changes show
          on it immediately (also from the player: Audio and subtitles → Subtitle style).
        </p>
      </div>
      <SubtitlePreview style={activeSubtitleStyle(appearance)} />
      <SubtitleStudio appearance={appearance} onChange={change} />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}
