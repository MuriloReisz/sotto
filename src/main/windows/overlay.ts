import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { MOVE_STEP_PX } from '../../shared/defaults'
import { moveOverlayBounds, placeOverlay } from '../../shared/geometry'
import { preventActivationOnClick } from '../native/mac-nonactivating'
import { devToolsAllowed, lockDownWebContents } from '../security'
import { getSettings, updateSettings } from '../store/settings'
import { setState } from '../state'

// The overlay is a single always-on-top window. Everything that makes it behave like
// an "assistant layer" (rather than a normal app window) is set up in this file.

const DEFAULT_SIZE = { width: 440, height: 560 }
const MARGIN = 24

let win: BrowserWindow | null = null
let quitting = false

export function getOverlayWindow(): BrowserWindow | null {
  return win
}

/** Call from app 'before-quit' so the close handler below lets the window really close. */
export function markQuitting(): void {
  quitting = true
}

const workAreas = (): Electron.Rectangle[] => screen.getAllDisplays().map((d) => d.workArea)

export function createOverlayWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const bounds = placeOverlay(
    getSettings().overlayBounds,
    workAreas(),
    screen.getPrimaryDisplay().workArea,
    DEFAULT_SIZE,
    MARGIN
  )

  win = new BrowserWindow({
    ...bounds,
    minWidth: 320,
    minHeight: 200,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true, // Windows: no taskbar button
    // macOS 'panel' = NSPanel: floats over full-screen apps and doesn't activate the app
    // when shown. Windows 'toolbar' = tool window: hidden from Alt-Tab.
    type: isMac ? 'panel' : 'toolbar',
    alwaysOnTop: true,
    // Never take keyboard focus by default. Clicking the overlay then doesn't steal focus
    // from the app behind it (browsers report focus loss to pages, and some interview or
    // proctoring tools watch for it). The chat box (M3) turns focus on only while typing.
    focusable: false,
    // macOS: the first click on a non-focused window acts immediately instead of only focusing.
    acceptFirstMouse: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: devToolsAllowed()
    }
  })

  lockDownWebContents(win.webContents)
  // macOS: clicking the overlay must not make Sotto the active app (see the file for why).
  preventActivationOnClick(win)

  // Hide the window from screen capture / sharing.
  //   macOS:   NSWindow.sharingType = .none
  //   Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE), Win10 2004+
  // See README > Screen-share invisibility for what has and hasn't been tested.
  win.setContentProtection(true)

  // 'screen-saver' is the highest always-on-top level: above full-screen apps and the Dock.
  win.setAlwaysOnTop(true, 'screen-saver')
  // Follow the user across Spaces / virtual desktops, including full-screen Spaces.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Closing only hides the overlay; quitting happens from the tray menu.
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      hideOverlay()
    }
  })

  // Track visibility from the window itself, whoever caused the change.
  win.on('show', () => setState({ visible: true }))
  win.on('hide', () => setState({ visible: false }))

  // Remember position/size across launches.
  win.on('moved', saveBounds)
  win.on('resized', saveBounds)

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/overlay/index.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/overlay/index.html'))
  }

  // Show without stealing keyboard focus from the app you're working in.
  win.once('ready-to-show', () => showOverlay())

  setState({ contentProtected: win.isContentProtected() })
  return win
}

export function showOverlay(): void {
  win?.showInactive()
}

export function hideOverlay(): void {
  win?.hide()
}

export function toggleOverlay(): void {
  if (win?.isVisible()) hideOverlay()
  else showOverlay()
}

/**
 * Click-through: mouse events pass to whatever is underneath the overlay.
 * `forward: true` still delivers mouse-move events to the page, so hover styles work.
 */
export function setClickThrough(enabled: boolean): void {
  if (!win) return
  win.setIgnoreMouseEvents(enabled, { forward: true })
  setState({ clickThrough: enabled })
}

/** Nudge the overlay; at a display edge it hops onto the neighbouring display, if any. */
export function moveOverlay(dx: -1 | 0 | 1, dy: -1 | 0 | 1): void {
  if (!win) return
  win.setBounds(moveOverlayBounds(win.getBounds(), dx, dy, workAreas(), MOVE_STEP_PX))
  saveBounds()
}

function saveBounds(): void {
  if (!win) return
  updateSettings({ overlayBounds: win.getBounds() })
}
