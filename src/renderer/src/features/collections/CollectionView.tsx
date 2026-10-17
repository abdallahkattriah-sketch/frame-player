import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Play, Trash2 } from 'lucide-react'
import type { Collection } from '@shared/contracts/collections'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog'
import { LibraryBrowser, playItems } from '@renderer/features/library/LibraryBrowser'
import { NameDialog } from './NameDialog'

export interface CollectionContextValue {
  collection: Collection
  /** File ids in the user's order. */
  order: number[]
}

/** Present while browsing a collection, so item menus can offer reorder/remove. */
export const CollectionContext = createContext<CollectionContextValue | null>(null)

export function useCurrentCollection(): CollectionContextValue | null {
  return useContext(CollectionContext)
}

const ignore = () => undefined

interface CollectionViewProps {
  collection: Collection
  search: string
  isFirst: boolean
  isLast: boolean
  /** After deletion. */
  onDeleted: () => void
}

export function CollectionView({
  collection,
  search,
  isFirst,
  isLast,
  onDeleted,
}: CollectionViewProps) {
  const [order, setOrder] = useState<number[]>([])
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const playlist = collection.kind === 'playlist'

  const loadOrder = useCallback(() => {
    window.frame.library
      .query({ view: 'all', collectionId: collection.id, sort: 'manual' })
      .then((items) =>
        setOrder(items.map((i) => i.fileId).filter((id): id is number => id !== null)),
      )
      .catch(ignore)
  }, [collection.id])

  useEffect(() => {
    loadOrder()
    return window.frame.library.onChanged(loadOrder)
  }, [loadOrder])

  const playAll = () => {
    window.frame.library
      .query({ view: 'all', collectionId: collection.id, sort: 'manual' })
      .then((items) => playItems(items.filter((i) => !i.missing)))
      .catch(ignore)
  }

  const button =
    'flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-elevated disabled:opacity-40'

  return (
    <CollectionContext.Provider value={{ collection, order }}>
      <LibraryBrowser
        key={collection.id}
        viewId={playlist ? 'playlist' : 'collection'}
        title={collection.name}
        query={{ view: 'all', collectionId: collection.id, search }}
        defaults={{ mode: playlist ? 'list' : 'grid', sort: 'manual', direction: 'asc' }}
        sortOptions={['manual', 'title', 'year', 'added', 'last-watched']}
        emptyState={`Nothing here yet. Use “Add to collection…” on any video to add it to this ${
          playlist ? 'playlist' : 'collection'
        }.`}
        headerExtra={
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={playAll}
              disabled={order.length === 0}
              className={`${button} border-accent text-accent`}
            >
              <Play size={14} aria-hidden /> Play all
            </button>
            <button type="button" onClick={() => setRenaming(true)} className={button}>
              <Pencil size={14} aria-hidden /> Rename
            </button>
            <button
              type="button"
              aria-label="Move up in sidebar"
              title="Move up in sidebar"
              disabled={isFirst}
              onClick={() => void window.frame.collections.move(collection.id, 'up').catch(ignore)}
              className={button}
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              aria-label="Move down in sidebar"
              title="Move down in sidebar"
              disabled={isLast}
              onClick={() =>
                void window.frame.collections.move(collection.id, 'down').catch(ignore)
              }
              className={button}
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className={`${button} text-danger`}
            >
              <Trash2 size={14} aria-hidden /> Delete
            </button>
          </div>
        }
      />
      {renaming && (
        <NameDialog
          title={`Rename ${playlist ? 'playlist' : 'collection'}`}
          initialName={collection.name}
          confirmLabel="Rename"
          onSubmit={(name) => window.frame.collections.rename(collection.id, name)}
          onClose={() => setRenaming(false)}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${collection.name}”?`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          window.frame.collections.delete(collection.id).then(onDeleted).catch(ignore)
        }}
      >
        Only the {playlist ? 'playlist' : 'collection'} is deleted. The videos stay in your library
        and on disk.
      </ConfirmDialog>
    </CollectionContext.Provider>
  )
}
