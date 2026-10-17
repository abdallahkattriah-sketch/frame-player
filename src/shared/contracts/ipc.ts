import { z } from 'zod'
import type { AppSettings, SettingsPatch } from '../settings/schema'
import type { CredentialId, CredentialStoreStatus } from './credentials'
import type { OpenMediaResult, PlayerCommand, PlayerState, ScreenshotResult } from './player'

export { IpcChannel, type IpcChannelName } from './channels'

export const appInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  platform: z.string().min(1),
  electronVersion: z.string().min(1),
})

export type AppInfo = z.infer<typeof appInfoSchema>

export interface StartupStatus {
  /** Present when the database was unreadable and Frame started with a fresh one. */
  databaseRecovery?: { backupPath: string }
}

/** API exposed to the renderer as `window.frame`. */
export interface FrameApi {
  app: {
    getInfo: () => Promise<AppInfo>
    getStartupStatus: () => Promise<StartupStatus>
  }
  settings: {
    get: () => Promise<AppSettings>
    update: (patch: SettingsPatch) => Promise<AppSettings>
  }
  credentials: {
    status: () => Promise<CredentialStoreStatus>
    set: (id: CredentialId, secret: string) => Promise<CredentialStoreStatus>
    delete: (id: CredentialId) => Promise<CredentialStoreStatus>
  }
  player: {
    /** Native pickers run in the main process; the chosen files replace the playlist. */
    openFilesDialog: () => Promise<OpenMediaResult>
    openFolderDialog: () => Promise<OpenMediaResult>
    /** Plays files dropped onto a window (folders expand to the videos inside). */
    openDroppedFiles: (files: readonly File[]) => Promise<OpenMediaResult>
    getState: () => Promise<PlayerState>
    command: (command: PlayerCommand) => Promise<void>
    screenshot: () => Promise<ScreenshotResult>
    /** Subscribes to state pushed from mpv; returns an unsubscribe function. */
    onState: (listener: (state: PlayerState) => void) => () => void
  }
}
