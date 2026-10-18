import { useEffect, useState } from 'react'
import type { AppInfo, StartupStatus } from '@shared/contracts/ipc'
import type { LibraryItem } from '@shared/contracts/library'
import type { OpenMediaResult } from '@shared/contracts/player'
import { useFileDrop } from '@renderer/features/player/use-file-drop'
import { MediaCard } from '@renderer/features/library/MediaCard'
import { playItems } from '@renderer/features/library/LibraryBrowser'
import { useLibraryQuery } from '@renderer/features/library/use-library'
import { Carousel } from '@renderer/components/ui/Carousel'
import { DiscoverHint, DiscoverRows, useBrowseState } from '@renderer/features/discover/Discover'

function Shelf({ title, items, testId }: { title: string; items: LibraryItem[]; testId: string }) {
  if (items.length === 0) return null
  return (
    <section aria-label={title} data-testid={testId} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <Carousel label={title} gap="gap-5">
        {items.map((item) => (
          <li key={item.fileId ?? item.historyKey} className="w-[150px] shrink-0">
            <MediaCard item={item} onPlay={() => playItems([item])} />
          </li>
        ))}
      </Carousel>
    </section>
  )
}

export function HomeView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [startup, setStartup] = useState<StartupStatus>({})
  const [error, setError] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const continueWatching = useLibraryQuery({ view: 'continue-watching', limit: 20 })
  const recentlyAdded = useLibraryQuery({ view: 'recently-added', limit: 20 })
  const recentlyWatched = useLibraryQuery({ view: 'recently-watched', limit: 20 })
  const browse = useBrowseState()

  useEffect(() => {
    let cancelled = false
    Promise.all([window.frame.app.getInfo(), window.frame.app.getStartupStatus()])
      .then(([appInfo, startupStatus]) => {
        if (cancelled) return
        setInfo(appInfo)
        setStartup(startupStatus)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const showResult = (result: OpenMediaResult) => setOpenError(result.error ?? null)
  const drop = useFileDrop(showResult)
  const open = (picker: () => Promise<OpenMediaResult>) => {
    picker()
      .then(showResult)
      .catch((err: unknown) => setOpenError(err instanceof Error ? err.message : String(err)))
  }

  const loaded = continueWatching.data && recentlyAdded.data && recentlyWatched.data
  const hasContent =
    (continueWatching.data?.length ?? 0) +
      (recentlyAdded.data?.length ?? 0) +
      (recentlyWatched.data?.length ?? 0) >
    0

  return (
    <div
      className={`flex min-h-full flex-col gap-9 rounded-xl ${
        drop.dragging ? 'outline-2 outline-dashed outline-accent' : ''
      }`}
      {...drop.handlers}
    >
      {startup.databaseRecovery && (
        <div
          role="alert"
          data-testid="database-recovered"
          className="max-w-2xl rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-left text-sm"
        >
          Frame&apos;s database could not be read, so a fresh one was created. The old file was kept
          at <span className="break-all text-muted">{startup.databaseRecovery.backupPath}</span>
        </div>
      )}

      {browse === 'ready' && <DiscoverRows hero="trending-week" rows={[]} />}

      {loaded && !hasContent && (
        <section className="flex flex-col gap-1" aria-labelledby="library-empty-heading">
          <h1 id="library-empty-heading" className="text-xl font-semibold tracking-tight">
            Your library is empty
          </h1>
          <p className="text-sm text-muted">
            Add the folders where you keep movies and shows, or open videos directly. You can also
            drop files here.
          </p>
        </section>
      )}
      <div className="flex flex-wrap gap-2" data-testid="home-actions">
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:brightness-110"
        >
          Add library folders
        </button>
        <button
          type="button"
          onClick={() => open(window.frame.player.openFilesDialog)}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-elevated"
        >
          Open videos…
        </button>
        <button
          type="button"
          onClick={() => open(window.frame.player.openFolderDialog)}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-elevated"
        >
          Open folder…
        </button>
      </div>

      {loaded && hasContent && (
        <>
          <Shelf
            title="Continue watching"
            items={continueWatching.data ?? []}
            testId="shelf-continue"
          />
          <Shelf title="Recently added" items={recentlyAdded.data ?? []} testId="shelf-recent" />
          <Shelf
            title="Recently watched"
            items={recentlyWatched.data ?? []}
            testId="shelf-watched"
          />
        </>
      )}

      {browse === 'ready' && (
        <DiscoverRows
          rows={[
            {
              list: 'trending-today',
              title: 'Top 10 today',
              subtitle: 'Movies and shows',
              topTen: true,
            },
            { list: 'shows-on-the-air', title: 'New episodes this week' },
            { list: 'movies-upcoming', title: 'Coming soon', subtitle: 'In cinemas soon' },
            { list: 'trending-movies', title: 'Trending movies' },
            { list: 'trending-shows', title: 'Trending shows' },
            { list: 'movies-now-playing', title: 'In cinemas now' },
            { list: 'movies-top-rated', title: 'Top rated movies' },
            { list: 'shows-top-rated', title: 'Top rated shows' },
          ]}
        />
      )}
      {browse === 'needs-token' && <DiscoverHint onOpenSettings={onOpenSettings} />}

      {openError && (
        <p role="alert" className="text-sm text-danger">
          {openError}
        </p>
      )}
      <p className="mt-auto text-xs text-subtle" data-testid="app-info">
        {error
          ? `Bridge error: ${error}`
          : info
            ? `${info.name} ${info.version} · Electron ${info.electronVersion}`
            : 'Connecting…'}
      </p>
    </div>
  )
}
