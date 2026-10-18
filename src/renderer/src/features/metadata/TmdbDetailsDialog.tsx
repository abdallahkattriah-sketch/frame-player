import { useEffect, useRef, useState } from 'react'
import { Check, ExternalLink, Film, Play, Plus, Star, Tv, X } from 'lucide-react'
import type { MediaMetadata, TmdbSearchResult, Trailer } from '@shared/contracts/metadata'
import { Artwork } from '@renderer/components/ui/Artwork'
import { useSettings } from '@renderer/app/settings-context'
import { TmdbLogo } from '@renderer/features/settings/TmdbLogo'
import {
  AddToCollectionDialog,
  CollectionMembership,
} from '@renderer/features/collections/AddToCollectionDialog'
import { resultLabel, titleInput } from './tmdb-title'

const YOUTUBE_EMBED = 'https://www.youtube-nocookie.com/embed/'
const EASE_OUT = 'cubic-bezier(0.2, 0.9, 0.25, 1)'

function errorText(e: unknown) {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e)
}

/** clip-path that shows only the part of `box` covered by `from` (clamped to the box). */
function clipTo(from: DOMRect, box: DOMRect, radius: number): string {
  const px = (n: number) => `${Math.max(0, Math.round(n))}px`
  return `inset(${px(from.top - box.top)} ${px(box.right - from.right)} ${px(
    box.bottom - from.bottom,
  )} ${px(from.left - box.left)} round ${radius}px)`
}

/**
 * Details of a TMDB title that may not be in the library. When opened from a poster it grows
 * out of that poster, and shrinks back into it when closed; the trailer plays at the top.
 */
export function TmdbDetailsDialog({
  result,
  origin,
  onClose,
}: {
  result: TmdbSearchResult
  /** Where the clicked poster is on screen. */
  origin?: DOMRect | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closing = useRef(false)
  const { settings } = useSettings()
  const motion = settings?.appearance.animations ?? 'full'
  const autoplay = settings?.metadata.autoplayTrailers ?? true
  const [adding, setAdding] = useState(false)
  const [details, setDetails] = useState<MediaMetadata | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trailer, setTrailer] = useState<Trailer | null>(null)
  // null: not playing; otherwise whether the sound starts muted.
  const [playing, setPlaying] = useState<{ muted: boolean } | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    if (motion === 'off') return
    const box = dialog.getBoundingClientRect()
    const duration = motion === 'reduced' ? 160 : 520
    dialog.animate(
      origin
        ? [
            { clipPath: clipTo(origin, box, 8), opacity: 0.5 },
            { clipPath: `inset(0px 0px 0px 0px round 16px)`, opacity: 1 },
          ]
        : [
            { opacity: 0, transform: 'translateY(12px) scale(0.97)' },
            { opacity: 1, transform: 'none' },
          ],
      { duration, easing: EASE_OUT },
    )
    dialog.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration,
      easing: 'ease-out',
      pseudoElement: '::backdrop',
    })
    // Opened once per mounted dialog; origin and motion are read at that moment only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let active = true
    window.frame.metadata
      .details(result.mediaType, result.tmdbId)
      .then((d) => active && setDetails(d))
      .catch((e: unknown) => active && setError(errorText(e)))
    window.frame.metadata
      .trailer(result.mediaType, result.tmdbId)
      .then((t) => active && setTrailer(t))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [result])

  // Start the trailer (muted) once the window has finished opening.
  useEffect(() => {
    if (!trailer || !autoplay) return
    const timer = window.setTimeout(() => setPlaying((p) => p ?? { muted: true }), 700)
    return () => window.clearTimeout(timer)
  }, [trailer, autoplay])

  const close = () => {
    const dialog = ref.current
    if (!dialog || closing.current) return
    closing.current = true
    if (motion === 'off') return onClose()
    // Stop the trailer before animating so the sound ends with the click.
    setPlaying(null)
    const box = dialog.getBoundingClientRect()
    const duration = motion === 'reduced' ? 120 : 380
    // The poster may have scrolled away; only shrink into it when it is still on screen.
    const target = origin && origin.bottom > 0 && origin.top < window.innerHeight ? origin : null
    const animation = dialog.animate(
      target
        ? [
            { clipPath: `inset(0px 0px 0px 0px round 16px)`, opacity: 1 },
            { clipPath: clipTo(target, box, 8), opacity: 0.3 },
          ]
        : [
            { opacity: 1, transform: 'none' },
            { opacity: 0, transform: 'translateY(8px) scale(0.97)' },
          ],
      { duration, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' },
    )
    dialog.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration,
      fill: 'forwards',
      pseudoElement: '::backdrop',
    })
    animation.onfinish = onClose
  }

  const m = details
  const facts = [
    m?.year ?? result.year,
    result.mediaType === 'tv' ? 'TV show' : 'Movie',
    m?.runtimeMinutes ? `${m.runtimeMinutes} min` : null,
    m?.genres.slice(0, 3).join(', ') || null,
  ].filter(Boolean)
  const backdrop = m?.backdropPath ?? result.backdropPath
  const Icon = result.mediaType === 'tv' ? Tv : Film
  const typeLabel = [result.mediaType === 'tv' ? 'TV show' : 'Movie', m?.year ?? result.year]
    .filter(Boolean)
    .join(' · ')

  return (
    <dialog
      ref={ref}
      aria-label={result.title}
      data-anim="custom"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={(e) => {
        // A click on the dimmed area outside the window closes it.
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect()
          const inside =
            e.clientX >= r.left &&
            e.clientX <= r.right &&
            e.clientY >= r.top &&
            e.clientY <= r.bottom
          if (!inside) close()
        }
      }}
      className="m-auto w-[min(920px,94vw)] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-sm text-text shadow-2xl backdrop:bg-black/70"
      data-testid="tmdb-details"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2 text-xs text-muted">
        <Icon size={14} aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {playing && trailer ? (trailer.name ?? 'Trailer') : typeLabel}
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="rounded-full p-1.5 text-muted transition hover:rotate-90 hover:bg-elevated hover:text-text"
        >
          <X size={17} />
        </button>
      </div>
      <div className="max-h-[calc(90vh-2.75rem)] overflow-y-auto">
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          {backdrop ? (
            <Artwork
              kind="backdrop"
              path={backdrop}
              alt=""
              className="absolute inset-0 h-full w-full scale-105 object-cover motion-safe:animate-[frame-zoom-out_1.2s_ease-out_forwards]"
              fallback={null}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-elevated">
              <Icon size={48} className="text-subtle" aria-hidden />
            </div>
          )}
          {trailer && playing && (
            <iframe
              key={playing.muted ? 'muted' : 'sound'}
              title={`Trailer: ${trailer.name ?? result.title}`}
              src={`${YOUTUBE_EMBED}${trailer.youtubeKey}?autoplay=1&mute=${
                playing.muted ? 1 : 0
              }&rel=0&playsinline=1`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-presentation"
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full animate-[frame-fade_800ms_ease-out]"
              data-testid="trailer"
            />
          )}
          {/* Fade the still picture into the window; hidden while the player is showing. */}
          <div
            className={`pointer-events-none absolute inset-x-0 -bottom-px h-2/5 bg-linear-to-t from-surface via-surface/60 to-transparent transition-opacity duration-500 ${
              playing ? 'opacity-0' : 'opacity-100'
            }`}
          />
          {trailer && !playing && (
            <button
              type="button"
              onClick={() => setPlaying({ muted: false })}
              className="absolute bottom-[38%] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/55 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:scale-105 hover:bg-accent hover:text-bg"
            >
              <Play size={16} className="fill-current" aria-hidden /> Play trailer
            </button>
          )}
        </div>

        <div
          className={`frame-stagger relative flex gap-6 px-7 pb-7 transition-[margin] duration-500 ${
            playing ? 'mt-6' : '-mt-20'
          }`}
        >
          <div className="aspect-[2/3] w-36 shrink-0 overflow-hidden rounded-lg border border-border shadow-2xl">
            <Artwork
              kind="poster"
              path={m?.posterPath ?? result.posterPath}
              alt=""
              className="h-full w-full object-cover"
              fallback={
                <div className="flex h-full w-full items-center justify-center bg-elevated">
                  <Icon size={22} className="text-subtle" aria-hidden />
                </div>
              }
            />
          </div>
          <div
            className={`flex min-w-0 flex-1 flex-col gap-2 transition-[padding] duration-500 ${
              playing ? 'pt-0' : 'pt-12'
            }`}
          >
            <h2 className="text-2xl font-bold tracking-tight" dir="auto">
              {m?.title ?? result.title}
            </h2>
            <p className="flex flex-wrap items-center gap-x-3 text-muted">
              {m?.voteAverage ? (
                <span className="flex items-center gap-1 text-text">
                  <Star size={14} className="fill-accent text-accent" aria-hidden />
                  {m.voteAverage.toFixed(1)}
                  {m.voteCount ? (
                    <span className="text-subtle">({m.voteCount.toLocaleString()})</span>
                  ) : null}
                </span>
              ) : null}
              {facts.join(' · ')}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {result.inLibrary && (
                <p className="flex items-center gap-1 text-accent">
                  <Check size={14} aria-hidden /> In your library
                </p>
              )}
              <CollectionMembership
                target={{ mediaType: result.mediaType, tmdbId: result.tmdbId }}
              />
            </div>
            <p className="max-w-prose leading-relaxed" dir="auto">
              {m?.overview ?? result.overview ?? (error ? '' : 'Loading…')}
            </p>
            {m && m.creators.length > 0 && (
              <p className="text-muted">
                {result.mediaType === 'tv' ? 'Created by ' : 'Directed by '}
                {m.creators.join(', ')}
              </p>
            )}
            {m && m.cast.length > 0 && (
              <p className="text-muted">
                With{' '}
                {m.cast
                  .slice(0, 6)
                  .map((c) => c.name)
                  .join(', ')}
              </p>
            )}
            {error && (
              <p role="alert" className="text-danger">
                {error}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-1.5 font-medium text-bg transition hover:brightness-110"
              >
                <Plus size={14} aria-hidden /> Add to collection…
              </button>
              <button
                type="button"
                onClick={() =>
                  void window.frame.metadata
                    .openTmdbPage(result.mediaType, result.tmdbId)
                    .catch(() => undefined)
                }
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 transition hover:bg-elevated"
              >
                <ExternalLink size={14} aria-hidden /> View on TMDB
              </button>
              <TmdbLogo className="ml-auto h-3" />
            </div>
          </div>
        </div>
      </div>
      {adding && (
        <AddToCollectionDialog
          target={{ label: resultLabel(result), title: titleInput(result) }}
          onClose={() => setAdding(false)}
        />
      )}
    </dialog>
  )
}
