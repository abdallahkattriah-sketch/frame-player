import { LibraryFoldersSection } from '@renderer/features/library/LibraryFoldersSection'

export function SettingsView() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <LibraryFoldersSection />
    </div>
  )
}
