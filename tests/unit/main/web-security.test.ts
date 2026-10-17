import { describe, expect, it } from 'vitest'
import { isAllowedAppUrl, secureWebPreferences } from '../../../src/main/security/web-security'

describe('secureWebPreferences', () => {
  it('keeps renderer isolated from Node', () => {
    const prefs = secureWebPreferences('C:\\app\\preload.js')
    expect(prefs).toMatchObject({
      preload: 'C:\\app\\preload.js',
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    })
  })
})

describe('isAllowedAppUrl', () => {
  it('allows only the dev server origin in development', () => {
    const dev = 'http://localhost:5173'
    expect(isAllowedAppUrl('http://localhost:5173/index.html', dev)).toBe(true)
    expect(isAllowedAppUrl('https://example.com/', dev)).toBe(false)
    expect(isAllowedAppUrl('file:///C:/evil.html', dev)).toBe(false)
    expect(isAllowedAppUrl('not a url', dev)).toBe(false)
  })

  it('allows only bundled files in production', () => {
    expect(isAllowedAppUrl('file:///C:/Program%20Files/Frame/index.html', undefined)).toBe(true)
    expect(isAllowedAppUrl('https://example.com/', undefined)).toBe(false)
  })
})
