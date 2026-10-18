import type { DragEvent } from 'react'
import type { CollectionTitleInput } from '@shared/contracts/collections'
import type { LibraryItem } from '@shared/contracts/library'

/** Data carried when a poster is dragged onto a collection in the sidebar. */
export type CollectionDragPayload = { fileId: number } | { title: CollectionTitleInput }

const MIME = 'application/x-frame-collection-item'

export function isCollectionDrag(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(MIME)
}

export function readCollectionDrag(e: DragEvent): CollectionDragPayload | null {
  try {
    const value: unknown = JSON.parse(e.dataTransfer.getData(MIME))
    if (typeof value !== 'object' || value === null) return null
    if ('fileId' in value && typeof value.fileId === 'number') return { fileId: value.fileId }
    if ('title' in value && typeof value.title === 'object' && value.title !== null) {
      // The main process validates the title again before saving it.
      return { title: value.title as CollectionTitleInput }
    }
  } catch {
    // Not one of ours.
  }
  return null
}

export function addDragged(collectionId: number, payload: CollectionDragPayload): Promise<unknown> {
  return 'fileId' in payload
    ? window.frame.collections.addItems(collectionId, [payload.fileId])
    : window.frame.collections.addTitle(collectionId, payload.title)
}

function dragProps(payload: CollectionDragPayload) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(MIME, JSON.stringify(payload))
      e.dataTransfer.effectAllowed = 'copy'
    },
  }
}

/** Makes a library poster draggable onto a collection (files only; not missing ones). */
export function fileDragProps(item: LibraryItem) {
  return item.fileId === null || item.missing ? {} : dragProps({ fileId: item.fileId })
}

export function titleDragProps(title: CollectionTitleInput) {
  return dragProps({ title })
}
