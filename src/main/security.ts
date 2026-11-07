import { app, session, type WebContents, type WebFrameMain } from 'electron'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { isSamePage, isUnder } from '../shared/trusted-url'

// Electron hardening beyond the BrowserWindow defaults (sandbox, contextIsolation, no
// nodeIntegration). The goal: only Sotto's own pages can run in its windows and talk to
// the main process, because the main process holds the API keys.

// Packaged builds never load a dev server, even if the env var is set.
const devServer = (): string | undefined => (app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'])

/** Origin our pages are served from: the Vite dev server in dev, the bundled files in production. */
function trustedPrefix(): string {
  const devUrl = devServer()
  if (devUrl) return new URL(devUrl).origin + '/'
  return pathToFileURL(join(__dirname, '../renderer')).href + '/'
}

/** Any of Sotto's own pages and files (navigation, IPC senders). */
export function isTrustedUrl(url: string): boolean {
  return isUnder(url, trustedPrefix())
}

/** The overlay page's exact URL, as windows/overlay.ts loads it (loadFile → file:// in a packaged build). */
function overlayPageUrl(): string {
  const devUrl = devServer()
  if (devUrl) return `${devUrl}/overlay/index.html`
  return pathToFileURL(join(__dirname, '../renderer/overlay/index.html')).href
}

/** Only the overlay page itself may use the microphone, system audio and clipboard. */
export function isOverlayPage(url: string): boolean {
  return isSamePage(url, overlayPageUrl())
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
 * only to the overlay page: microphone + system audio for live listening (M4).
 * Both handlers judge the requesting frame's full URL. Not the origin: a file:// page's
 * origin is just "file://" (or "null"), which says nothing about which file asked.
 */
const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture', 'clipboard-sanitized-write'])

export function restrictPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(ALLOWED_PERMISSIONS.has(permission) && isOverlayPage(details.requestingUrl || contents.getURL()))
  })
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    return ALLOWED_PERMISSIONS.has(permission) && isOverlayPage(details.requestingUrl || contents?.getURL() || '')
  })
}

/** DevTools only in development; in a packaged build they can't be opened at all. */
export const devToolsAllowed = (): boolean => !app.isPackaged
