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
  LibraryListFolders: 'library:list-folders',
  LibraryAddFolderDialog: 'library:add-folder-dialog',
  LibraryRemoveFolder: 'library:remove-folder',
  LibraryUpdateFolder: 'library:update-folder',
  LibraryRescan: 'library:rescan',
  /** Main → renderer pushes. */
  PlayerStateChanged: 'player:state-changed',
  LibraryScanProgress: 'library:scan-progress',
} as const

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel]
