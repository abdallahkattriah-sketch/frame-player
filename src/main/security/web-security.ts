import type { Session, WebContents, WebPreferences } from 'electron'

export function secureWebPreferences(preloadPath: string): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    spellcheck: false,
  }
}

/** Only the app's own pages may be loaded: the dev server origin or the bundled file. */
export function isAllowedAppUrl(url: string, devServerUrl: string | undefined): boolean {
  if (devServerUrl) {
    try {
      return new URL(url).origin === new URL(devServerUrl).origin
    } catch {
      return false
    }
  }
  return url.startsWith('file://')
}

export function hardenSession(session: Session): void {
  // Frame needs no camera, microphone, notifications, geolocation, etc.
  session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
}

export function hardenWebContents(contents: WebContents, devServerUrl: string | undefined): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedAppUrl(url, devServerUrl)) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
}
