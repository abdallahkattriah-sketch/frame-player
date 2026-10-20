import { createContext, useContext } from 'react'
import type { TmdbSearchResult } from '@shared/contracts/metadata'

/** Opens person profiles and TMDB title details from anywhere, stacked over the current view. */
export interface PeopleActions {
  openPerson: (personId: number) => void
  openTitle: (result: TmdbSearchResult) => void
}

export const PeopleActionsContext = createContext<PeopleActions>({
  openPerson: () => undefined,
  openTitle: () => undefined,
})

export function usePeopleActions(): PeopleActions {
  return useContext(PeopleActionsContext)
}
