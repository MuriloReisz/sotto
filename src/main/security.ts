import { app, session, type WebContents, type WebFrameMain } from 'electron'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

// Electron hardening beyond the BrowserWindow defaults (sandbox, contextIsolation, no
// nodeIntegration). The goal: only Sotto's own pages can run in its windows and talk to
// the main process, because the main process holds the API keys.

/** Origin our pages are served from: the Vite dev server in dev, the bundled files in production. */
function trustedPrefix(): string {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return new URL(devUrl).origin + '/'
  return pathToFileURL(join(__dirname, '../renderer')).href + '/'
}

export function isTrustedUrl(url: string): boolean {
  return url.startsWith(trustedPrefix())
}

/** For IPC handlers: was this message sent by one of our own pages? */
export function isTrustedSender(frame: WebFrameMain | null): boolean {
  return frame !== null && isTrustedUrl(frame.url)
}

/**
 * Lock a window's web contents to our own pages. Without this, dropping a link or file
 * onto the overlay would load it *with the preload bridge attached*, giving a remote page
 * the same powers as our UI.
 */
export function lockDownWebContents(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault()
  })
  contents.on('will-redirect', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault()
  })
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-attach-webview', (event) => event.preventDefault())
}

/**
 * Electron grants every permission request by default. Allow only what Sotto uses, and
 * only to its own pages: microphone + system audio for live listening (M4).
 */
const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture', 'clipboard-sanitized-write'])

export function restrictPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission) && isTrustedUrl(contents.getURL()))
  })
  session.defaultSession.setPermissionCheckHandler((_contents, permission, origin) => {
    return ALLOWED_PERMISSIONS.has(permission) && isTrustedUrl(origin + '/')
  })
}

/** DevTools only in development; in a packaged build they can't be opened at all. */
export const devToolsAllowed = (): boolean => !app.isPackaged
