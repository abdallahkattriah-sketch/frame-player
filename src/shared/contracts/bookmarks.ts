import { z } from 'zod'

export interface Bookmark {
  id: number
  /** Seconds from the start. */
  position: number
  /** Null until the user names it; shown as the timestamp. */
  title: string | null
  note: string | null
  createdAt: string
  /** `frame-art://bookmark/<id>.jpg` once its thumbnail exists, else null. */
  thumbnailUrl: string | null
}

export const bookmarkIdSchema = z.number().int().positive()

/** Edits from the renderer. An empty title or note clears it. */
export const bookmarkEditSchema = z
  .object({
    title: z.string().trim().max(200),
    note: z.string().trim().max(2000),
  })
  .partial()
  .strict()

export type BookmarkEdit = z.infer<typeof bookmarkEditSchema>
