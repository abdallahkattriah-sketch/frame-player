import { LibraryFoldersSection } from '@renderer/features/library/LibraryFoldersSection'
import { AboutSection } from './AboutSection'
import { MetadataSection } from './MetadataSection'
import { PlaybackSection } from './PlaybackSection'
import { AppearanceSection } from './AppearanceSection'
import { KeyboardSection } from './KeyboardSection'
import { SubtitlesSection } from './SubtitlesSection'
import { SubtitleAppearanceSection } from './SubtitleAppearanceSection'

export function SettingsView() {
  return (
    <div className="flex flex-col gap-10 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <LibraryFoldersSection />
      <PlaybackSection />
      <AppearanceSection />
      <KeyboardSection />
      <MetadataSection />
      <SubtitlesSection />
      <SubtitleAppearanceSection />
      <AboutSection />
    </div>
  )
}
