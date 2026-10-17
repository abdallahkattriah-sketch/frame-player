import { useState } from 'react'
import { BookmarkPlus, Pencil, Trash2, X } from 'lucide-react'
import type { Bookmark, BookmarkEdit } from '@shared/contracts/bookmarks'
import { formatTime } from './format-time'
import { sendCommand } from './send-command'

interface BookmarksPanelProps {
  bookmarks: readonly Bookmark[]
  onAdd: () => void
  onEdit: (id: number, edit: BookmarkEdit) => Promise<void>
  onRemove: (id: number) => void
  onClose: () => void
}

export function bookmarkLabel(bookmark: Bookmark): string {
  return bookmark.title ?? `Bookmark at ${formatTime(bookmark.position)}`
}

function BookmarkEditor({
  bookmark,
  onSave,
  onCancel,
}: {
  bookmark: Bookmark
  onSave: (edit: BookmarkEdit) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(bookmark.title ?? '')
  const [note, setNote] = useState(bookmark.note ?? '')
  return (
    <form
      className="flex flex-col gap-1.5 p-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ title, note })
      }}
    >
      <input
        aria-label="Bookmark title"
        value={title}
        maxLength={200}
        placeholder={`Bookmark at ${formatTime(bookmark.position)}`}
        onChange={(e) => setTitle(e.currentTarget.value)}
        className="rounded-md border border-border bg-bg px-2 py-1 text-sm"
        autoFocus
      />
      <textarea
        aria-label="Bookmark note"
        value={note}
        maxLength={2000}
        rows={2}
        placeholder="Note (optional)"
        onChange={(e) => setNote(e.currentTarget.value)}
        className="resize-none rounded-md border border-border bg-bg px-2 py-1 text-sm"
      />
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-xs text-muted hover:bg-elevated"
        >
          Cancel
        </button>
        <button type="submit" className="rounded-md bg-accent px-2 py-1 text-xs text-bg">
          Save
        </button>
      </div>
    </form>
  )
}

export function BookmarksPanel({
  bookmarks,
  onAdd,
  onEdit,
  onRemove,
  onClose,
}: BookmarksPanelProps) {
  const [editing, setEditing] = useState<number | null>(null)
  return (
    <aside
      aria-label="Bookmarks"
      className="absolute bottom-28 right-4 top-4 flex w-80 flex-col rounded-lg border border-border bg-surface/95 shadow-xl"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <header className="flex items-center gap-1 border-b border-border px-3 py-2">
        <h2 className="flex-1 text-sm font-medium">
          Bookmarks <span className="text-subtle">({bookmarks.length})</span>
        </h2>
        <button
          type="button"
          aria-label="Add bookmark here"
          title="Add bookmark here (B)"
          onClick={onAdd}
          className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-text"
        >
          <BookmarkPlus size={16} />
        </button>
        <button
          type="button"
          aria-label="Close bookmarks"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-text"
        >
          <X size={16} />
        </button>
      </header>
      {bookmarks.length === 0 ? (
        <p className="p-4 text-sm text-muted">
          No bookmarks yet. Press B or the + button to mark the current moment.
        </p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto p-1.5" data-testid="bookmark-list">
          {bookmarks.map((b) => (
            <li key={b.id} className="group rounded-md hover:bg-elevated/60">
              {editing === b.id ? (
                <BookmarkEditor
                  bookmark={b}
                  onCancel={() => setEditing(null)}
                  onSave={(edit) => {
                    void onEdit(b.id, edit).finally(() => setEditing(null))
                  }}
                />
              ) : (
                <div className="flex items-start gap-2 p-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      sendCommand({ type: 'seek', mode: 'absolute', seconds: b.position })
                    }
                    aria-label={`Go to ${bookmarkLabel(b)} (${formatTime(b.position)})`}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <span className="h-[45px] w-20 shrink-0 overflow-hidden rounded bg-bg">
                      {b.thumbnailUrl && (
                        <img src={b.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{bookmarkLabel(b)}</span>
                      <span className="block text-xs tabular-nums text-accent">
                        {formatTime(b.position)}
                      </span>
                      {b.note && (
                        <span className="line-clamp-2 block text-xs text-muted">{b.note}</span>
                      )}
                    </span>
                  </button>
                  <div className="flex flex-col opacity-0 focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label={`Edit ${bookmarkLabel(b)}`}
                      onClick={() => setEditing(b.id)}
                      className="rounded-md p-1 text-subtle hover:bg-elevated hover:text-text"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${bookmarkLabel(b)}`}
                      onClick={() => onRemove(b.id)}
                      className="rounded-md p-1 text-subtle hover:bg-elevated hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
