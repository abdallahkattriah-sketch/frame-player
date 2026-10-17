import tmdbLogo from '@renderer/assets/tmdb-logo.svg'

/** Official TMDB logo (approved variant), shown smaller than Frame's own branding. */
export function TmdbLogo({ className }: { className?: string }) {
  return <img src={tmdbLogo} alt="The Movie Database (TMDB)" className={className ?? 'h-3'} />
}

export const TMDB_NOTICE =
  'This product uses the TMDB API but is not endorsed or certified by TMDB.'
