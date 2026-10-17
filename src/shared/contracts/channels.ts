// Dependency-free on purpose: the sandboxed preload can only require 'electron'.

/** Every IPC channel the renderer may invoke. Nothing outside this list is handled. */
export const IpcChannel = {
  AppGetInfo: 'app:get-info',
  AppGetStartupStatus: 'app:get-startup-status',
  SettingsGet: 'settings:get',
  SettingsUpdate: 'settings:update',
  CredentialsStatus: 'credentials:status',
  CredentialsSet: 'credentials:set',
  CredentialsDelete: 'credentials:delete',
  PlayerOpenFilesDialog: 'player:open-files-dialog',
  PlayerOpenFolderDialog: 'player:open-folder-dialog',
  PlayerOpenPaths: 'player:open-paths',
  PlayerGetState: 'player:get-state',
  PlayerCommand: 'player:command',
  PlayerScreenshot: 'player:screenshot',
  /** Main → renderer push. */
  PlayerStateChanged: 'player:state-changed',
} as const

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel]
