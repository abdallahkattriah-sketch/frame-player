import { LibraryFoldersSection } from '@renderer/features/library/LibraryFoldersSection'
import { AboutSection } from './AboutSection'
import { MetadataSection } from './MetadataSection'
import { SubtitlesSection } from './SubtitlesSection'

export function SettingsView() {
  return (
    <div className="flex flex-col gap-10 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <LibraryFoldersSection />
      <MetadataSection />
      <SubtitlesSection />
      <AboutSection />
    </div>
  )
}
