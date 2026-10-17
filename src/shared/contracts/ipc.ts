import { z } from 'zod'

export { IpcChannel, type IpcChannelName } from './channels'

export const appInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  platform: z.string().min(1),
  electronVersion: z.string().min(1),
})

export type AppInfo = z.infer<typeof appInfoSchema>

/** API exposed to the renderer as `window.frame`. */
export interface FrameApi {
  app: {
    getInfo: () => Promise<AppInfo>
  }
}
