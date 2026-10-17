import { useCallback, useEffect, useState } from 'react'
import type { Bookmark, BookmarkEdit } from '@shared/contracts/bookmarks'

/** Bookmarks of the playing video; reloads when the video changes or the main process says so. */
export function useBookmarks(path: string | null) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])

  const reload = useCallback(() => {
    window.frame.bookmarks
      .list()
      .then(setBookmarks)
      .catch(() => setBookmarks([]))
  }, [])

  useEffect(() => {
    if (path) reload()
    return window.frame.bookmarks.onChanged(reload)
  }, [path, reload])

  const visible = path ? bookmarks : []

  return {
    bookmarks: visible,
    add: useCallback(async () => {
      const added = await window.frame.bookmarks.add()
      reload()
      return added
    }, [reload]),
    edit: useCallback(
      async (id: number, edit: BookmarkEdit) => {
        await window.frame.bookmarks.edit(id, edit)
        reload()
      },
      [reload],
    ),
    remove: useCallback(
      async (id: number) => {
        await window.frame.bookmarks.remove(id)
        reload()
      },
      [reload],
    ),
  }
}
