// Dependency-free on purpose: the sandboxed preload can only require 'electron'.

/** Every IPC channel the renderer may invoke. Nothing outside this list is handled. */
export const IpcChannel = {
  AppGetInfo: 'app:get-info',
} as const

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel]
