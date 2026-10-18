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

/** Origin of embedded trailers; the only third-party content Frame shows. */
export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com'

/**
 * YouTube's embedded player requires API clients to identify themselves with an HTTPS
 * Referer naming the app ID; Electron sends none from file:// pages
 * (developers.google.com/youtube/terms/required-minimum-functionality).
 */
export function identifyToYouTube(session: Session, appId: string): void {
  session.webRequest.onBeforeSendHeaders(
    { urls: [`${YOUTUBE_EMBED_ORIGIN}/embed/*`] },
    (details, callback) => {
      callback({ requestHeaders: { ...details.requestHeaders, Referer: `https://${appId}/` } })
    },
  )
}

export function hardenWebContents(contents: WebContents, devServerUrl: string | undefined): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedAppUrl(url, devServerUrl)) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
  // A page that cannot load leaves a blank window; say why in the log.
  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) console.error(`window: could not load ${url}: ${description} (${code})`)
  })
}
