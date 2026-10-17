import { useState, type DragEvent } from 'react'
import type { OpenMediaResult } from '@shared/contracts/player'

/** Drag-and-drop of files from the OS. Calls `onResult` with what the player queued. */
export function useFileDrop(onResult: (result: OpenMediaResult) => void) {
  const [dragging, setDragging] = useState(false)

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

  return {
    dragging,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      },
      onDragLeave: (e: DragEvent) => {
        if (e.currentTarget === e.target) setDragging(false)
      },
      onDrop: (e: DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setDragging(false)
        window.frame.player
          .openDroppedFiles(Array.from(e.dataTransfer.files))
          .then(onResult)
          .catch((err: unknown) =>
            onResult({ queued: 0, error: err instanceof Error ? err.message : String(err) }),
          )
      },
    },
  }
}
