import { useCallback, useEffect, useState } from 'react'
import type { FollowedPerson, FollowPersonInput } from '@shared/contracts/people'

/** Ids of followed people, kept current across views and windows. */
export function useFollowedIds(): Set<number> {
  const [ids, setIds] = useState<Set<number>>(() => new Set())
  useEffect(() => {
    let active = true
    const load = () =>
      void window.frame.people
        .followedIds()
        .then((list) => active && setIds(new Set(list)))
        .catch(() => undefined)
    load()
    const off = window.frame.people.onChanged(load)
    return () => {
      active = false
      off()
    }
  }, [])
  return ids
}

/** Followed people, newest first, filtered by name. */
export function useFollowedPeople(search: string): {
  people: FollowedPerson[] | null
  error: string | null
} {
  const [people, setPeople] = useState<FollowedPerson[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const load = () =>
      void window.frame.people
        .list(search)
        .then((list) => {
          if (!active) return
          setPeople(list)
          setError(null)
        })
        .catch((e: unknown) => active && setError(e instanceof Error ? e.message : String(e)))
    load()
    const off = window.frame.people.onChanged(load)
    return () => {
      active = false
      off()
    }
  }, [search])
  return { people, error }
}

/** Follow or unfollow; errors are returned so the button can show them. */
export function useFollowToggle() {
  return useCallback(async (person: FollowPersonInput, following: boolean) => {
    if (following) await window.frame.people.unfollow(person.personId)
    else {
      // Only the input fields: the main process rejects anything extra.
      const { personId, name, profilePath, department } = person
      await window.frame.people.follow({ personId, name, profilePath, department })
    }
  }, [])
}
