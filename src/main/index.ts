import { app, BrowserWindow, session } from 'electron'
import { join } from 'node:path'
import { hardenSession, hardenWebContents, secureWebPreferences } from './security/web-security'
import { registerIpcHandlers } from './ipc/register-handlers'

const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 520,
    show: false,
    title: 'Frame',
    backgroundColor: '#14161B',
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences(join(__dirname, '../preload/index.js')),
  })

  hardenWebContents(win.webContents, devServerUrl)
  win.once('ready-to-show', () => win.show())

  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    hardenSession(session.defaultSession)
    registerIpcHandlers()
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
