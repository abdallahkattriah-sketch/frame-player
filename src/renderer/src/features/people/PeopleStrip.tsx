import type { MediaMetadata } from '@shared/contracts/metadata'
import type { FollowPersonInput } from '@shared/contracts/people'
import { FollowButton, PersonPhoto } from './FollowButton'
import { departmentForJob } from './filmography'
import { usePeopleActions } from './people-actions'
import { useFollowedIds } from './use-people'

interface StripPerson extends FollowPersonInput {
  role: string | null
}

/** Key crew, then the top-billed cast, each person once. */
function peopleOf(m: MediaMetadata): StripPerson[] {
  const seen = new Map<number, StripPerson>()
  for (const c of m.crew) {
    const known = seen.get(c.personId)
    if (known) known.role = `${known.role}, ${c.job}`
    else
      seen.set(c.personId, {
        personId: c.personId,
        name: c.name,
        profilePath: c.profilePath,
        department: departmentForJob(c.job),
        role: c.job,
      })
  }
  for (const c of m.cast.slice(0, 10)) {
    if (!c.personId || seen.has(c.personId)) continue
    seen.set(c.personId, {
      personId: c.personId,
      name: c.name,
      profilePath: c.profilePath,
      department: 'Acting',
      role: c.character,
    })
  }
  return [...seen.values()]
}

/** Scrollable row of cast and crew: click to open a profile, the round button follows. */
export function PeopleStrip({ metadata }: { metadata: MediaMetadata }) {
  const followed = useFollowedIds()
  const { openPerson } = usePeopleActions()
  const people = peopleOf(metadata)
  if (people.length === 0) return null
  return (
    <div className="flex flex-col gap-2" data-testid="people-strip">
      <h3 className="text-xs font-semibold tracking-wide text-subtle uppercase">Cast &amp; crew</h3>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {people.map(({ role, ...person }) => (
          <li key={person.personId} className="shrink-0">
            <div className="group flex w-56 items-center gap-2.5 rounded-lg border border-border/70 bg-elevated/40 p-2 transition hover:border-border hover:bg-elevated">
              <button
                type="button"
                onClick={() => openPerson(person.personId)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <PersonPhoto path={person.profilePath} name="" className="size-10" />
                <span className="min-w-0">
                  <span className="block truncate font-medium group-hover:text-accent" dir="auto">
                    {person.name}
                  </span>
                  {role && (
                    <span className="block truncate text-xs text-muted" dir="auto">
                      {role}
                    </span>
                  )}
                </span>
              </button>
              <FollowButton person={person} following={followed.has(person.personId)} compact />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
