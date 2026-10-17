import { LibraryFoldersSection } from '@renderer/features/library/LibraryFoldersSection'
import { AboutSection } from './AboutSection'
import { MetadataSection } from './MetadataSection'
import { PlaybackSection } from './PlaybackSection'
import { AppearanceSection } from './AppearanceSection'
import { KeyboardSection } from './KeyboardSection'
import { SubtitlesSection } from './SubtitlesSection'
import { SubtitleAppearanceSection } from './SubtitleAppearanceSection'
import { AudioSection, GeneralSection, PrivacySection, StorageSection } from './MoreSections'

/** Section headings, in page order, for the index. */
const index = [
  { label: 'General', heading: 'general-heading' },
  { label: 'Library', heading: 'library-folders-heading' },
  { label: 'Playback', heading: 'playback-heading' },
  { label: 'Audio', heading: 'audio-heading' },
  { label: 'Subtitles', heading: 'subtitles-heading' },
  { label: 'Subtitle providers', heading: 'subtitle-providers-heading' },
  { label: 'Subtitle Studio', heading: 'subtitle-style-heading' },
  { label: 'TMDB metadata', heading: 'metadata-heading' },
  { label: 'Appearance', heading: 'appearance-heading' },
  { label: 'Keyboard shortcuts', heading: 'keyboard-heading' },
  { label: 'Storage and cache', heading: 'storage-heading' },
  { label: 'Privacy', heading: 'privacy-heading' },
  { label: 'About', heading: 'about-heading' },
]

export function SettingsView({ onRunSetup }: { onRunSetup: () => void }) {
  return (
    <div className="flex gap-8">
      <nav
        aria-label="Settings sections"
        className="sticky top-0 hidden w-44 shrink-0 self-start lg:block"
      >
        <ul className="flex flex-col gap-0.5 text-sm">
          {index.map((entry) => (
            <li key={entry.heading}>
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById(entry.heading)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="w-full rounded-md px-2 py-1 text-left text-muted hover:bg-surface hover:text-text"
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-10 pb-10">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <GeneralSection onRunSetup={onRunSetup} />
        <LibraryFoldersSection />
        <PlaybackSection />
        <AudioSection />
        <SubtitlesSection />
        <SubtitleAppearanceSection />
        <MetadataSection />
        <AppearanceSection />
        <KeyboardSection />
        <StorageSection />
        <PrivacySection />
        <AboutSection />
      </div>
    </div>
  )
}
