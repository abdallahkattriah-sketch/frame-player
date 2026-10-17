import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/contracts/ipc'
import { TMDB_NOTICE, TmdbLogo } from './TmdbLogo'

export function AboutSection() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    void window.frame.app.getInfo().then(setInfo)
  }, [])

  return (
    <section aria-labelledby="about-heading" className="flex max-w-3xl flex-col gap-3">
      <h2 id="about-heading" className="text-lg font-semibold">
        About
      </h2>
      <p className="text-sm">
        <span className="font-semibold">
          Frame<span className="text-accent">.</span>
        </span>{' '}
        <span className="text-muted">{info ? `version ${info.version}` : ''}</span>
      </p>
      <p className="text-sm text-muted">
        A local-first video player. Playback is powered by mpv (GPL-2.0-or-later), which runs as a
        separate program alongside Frame.
      </p>
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-subtle">Data sources</div>
        <div className="flex items-center gap-3">
          <TmdbLogo className="h-3.5" />
          <span data-testid="tmdb-attribution">{TMDB_NOTICE}</span>
        </div>
        <p className="text-xs text-subtle">
          Movie and TV information and images are provided by TMDB under its API terms of use for
          non-commercial use.
        </p>
      </div>
    </section>
  )
}
