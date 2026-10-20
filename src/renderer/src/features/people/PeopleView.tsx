import { useState } from 'react'
import { Users } from 'lucide-react'
import { Dropdown } from '@renderer/components/ui/Dropdown'
import { FollowButton, PersonPhoto } from './FollowButton'
import { departmentLabel } from './filmography'
import { formatDay } from './PersonDialog'
import { usePeopleActions } from './people-actions'
import { useFollowedPeople } from './use-people'

/** Everyone the user follows. Stored locally, so it works offline. */
export function PeopleView({ search }: { search: string }) {
  const { people, error } = useFollowedPeople(search)
  const { openPerson } = usePeopleActions()
  const [department, setDepartment] = useState('')
  const departments = [...new Set((people ?? []).map((p) => p.department ?? 'Other'))].sort()
  const shown = (people ?? []).filter(
    (p) => !department || (p.department ?? 'Other') === department,
  )

  return (
    <section className="flex h-full flex-col gap-4" aria-labelledby="people-heading">
      <header className="flex flex-wrap items-center gap-3">
        <h1 id="people-heading" className="text-2xl font-semibold tracking-tight">
          Following
        </h1>
        {people && (
          <span className="text-sm text-subtle" data-testid="item-count">
            {shown.length.toLocaleString()} {shown.length === 1 ? 'person' : 'people'}
          </span>
        )}
        {departments.length > 1 && (
          <div className="ml-auto text-sm">
            <Dropdown
              label="Department"
              groups={[
                {
                  value: department,
                  options: [
                    { value: '', label: 'All departments' },
                    ...departments.map((d) => ({ value: d, label: departmentLabel(d) })),
                  ],
                  onChange: setDepartment,
                },
              ]}
            />
          </div>
        )}
      </header>

      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}

      {people && shown.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted">
          <Users size={40} className="text-subtle" aria-hidden />
          {search || department ? (
            <p>No one you follow matches.</p>
          ) : (
            <>
              <p className="text-base text-text">You are not following anyone yet.</p>
              <p className="max-w-sm">
                Open any movie or show and use the round button next to an actor or director to
                follow them. Their new releases will show up in Radar.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
          {shown.map((p) => (
            <li key={p.personId}>
              <div className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-lg">
                <button
                  type="button"
                  onClick={() => openPerson(p.personId)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <PersonPhoto path={p.profilePath} name="" className="size-14" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium group-hover:text-accent" dir="auto">
                      {p.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {p.department ? departmentLabel(p.department) : 'Unknown department'}
                    </span>
                    <span className="block truncate text-[11px] text-subtle">
                      Since {formatDay(p.followedAt.slice(0, 10))}
                    </span>
                  </span>
                </button>
                <FollowButton person={p} following compact />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
