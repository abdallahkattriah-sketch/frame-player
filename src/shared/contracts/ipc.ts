import { z } from 'zod'
import type { AppSettings, SettingsPatch } from '../settings/schema'
import type { CredentialId, CredentialStoreStatus } from './credentials'

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
}
