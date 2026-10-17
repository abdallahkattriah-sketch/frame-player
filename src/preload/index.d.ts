import type { FrameApi } from '../shared/contracts/ipc'

declare global {
  interface Window {
    frame: FrameApi
  }
}

export {}
