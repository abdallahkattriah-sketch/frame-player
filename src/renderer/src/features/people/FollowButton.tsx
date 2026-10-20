import { useState } from 'react'
import { Check, UserPlus, User } from 'lucide-react'
import type { FollowPersonInput } from '@shared/contracts/people'
import { Artwork } from '@renderer/components/ui/Artwork'
import { useFollowToggle } from './use-people'

/** Follow / Following toggle; while following, hovering offers Unfollow. */
export function FollowButton({
  person,
  following,
  compact = false,
}: {
  person: FollowPersonInput
  following: boolean
  /** Icon-only round button, for people chips. */
  compact?: boolean
}) {
  const toggle = useFollowToggle()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const label = following ? `Unfollow ${person.name}` : `Follow ${person.name}`

  const onClick = (e: React.MouseEvent) => {
    // Chips and cards around the button open the person; the button only toggles.
    e.stopPropagation()
    setBusy(true)
    setError(null)
    toggle(person, following)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }

  if (compact) {
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={following}
        title={error ?? label}
        disabled={busy}
        onClick={onClick}
        className={`flex size-7 shrink-0 items-center justify-center rounded-full border transition ${
          following
            ? 'border-accent bg-accent text-bg hover:brightness-110'
            : 'border-border bg-surface text-muted hover:border-accent hover:text-accent'
        } ${error ? 'ring-1 ring-danger' : ''}`}
      >
        {following ? <Check size={14} aria-hidden /> : <UserPlus size={14} aria-hidden />}
      </button>
    )
  }

  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        aria-pressed={following}
        disabled={busy}
        onClick={onClick}
        className={`group flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium transition ${
          following
            ? 'border border-accent text-accent hover:border-danger hover:text-danger'
            : 'bg-accent text-bg hover:brightness-110'
        }`}
      >
        {following ? (
          <>
            <Check size={14} aria-hidden className="group-hover:hidden" />
            <span className="group-hover:hidden">Following</span>
            <span className="hidden group-hover:inline">Unfollow</span>
          </>
        ) : (
          <>
            <UserPlus size={14} aria-hidden /> Follow
          </>
        )}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  )
}

/** Round profile photo with an initial-free fallback icon. */
export function PersonPhoto({
  path,
  name,
  className = 'size-12',
}: {
  path: string | null
  name: string
  className?: string
}) {
  return (
    <span
      className={`block shrink-0 overflow-hidden rounded-full border border-border bg-elevated ${className}`}
    >
      <Artwork
        kind="profile"
        path={path}
        alt={name}
        className="h-full w-full object-cover"
        fallback={
          <span className="flex h-full w-full items-center justify-center text-subtle">
            <User size={18} aria-hidden />
          </span>
        }
      />
    </span>
  )
}
