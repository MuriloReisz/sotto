import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { MOVE_STEP_PX } from '../../shared/defaults'
import type { Bounds } from '../../shared/types'
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

export function createOverlayWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const bounds = initialBounds(getSettings().overlayBounds)

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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Hide the window from screen capture / sharing.
  //   macOS:   NSWindow.sharingType = .none
  //   Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE), Win10 2004+
  // Limitation: on macOS 15+ apps that capture through ScreenCaptureKit (Zoom, Teams,
  // QuickTime, Cmd+Shift+5) are reported to ignore this. See README > Known limitations.
  win.setContentProtection(true)

  // 'screen-saver' is the highest always-on-top level: above full-screen apps and the Dock.
  win.setAlwaysOnTop(true, 'screen-saver')
  // Follow the user across Spaces / virtual desktops, including full-screen Spaces.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Closing (e.g. Cmd+W) only hides the overlay; quitting happens from the tray menu.
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      hideOverlay()
    }
  })

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
  if (!win) return
  win.showInactive()
  setState({ visible: true })
}

export function hideOverlay(): void {
  if (!win) return
  win.hide()
  setState({ visible: false })
}

export function toggleOverlay(): void {
  if (win?.isVisible()) hideOverlay()
  else showOverlay()
}

/**
 * Click-through: mouse events pass to whatever is underneath the overlay.
 * `forward: true` still delivers mouse-move events to the page, so hover styles work.
 * The window also stops taking keyboard focus while click-through is on.
 */
export function setClickThrough(enabled: boolean): void {
  if (!win) return
  win.setIgnoreMouseEvents(enabled, { forward: true })
  win.setFocusable(!enabled)
  setState({ clickThrough: enabled })
}

/** Nudge the overlay, keeping it on the display it ends up on. */
export function moveOverlay(dx: number, dy: number): void {
  if (!win) return
  const b = win.getBounds()
  const wanted = { ...b, x: b.x + dx * MOVE_STEP_PX, y: b.y + dy * MOVE_STEP_PX }
  const area = screen.getDisplayMatching(wanted).workArea
  const x = clamp(wanted.x, area.x, area.x + area.width - b.width)
  const y = clamp(wanted.y, area.y, area.y + area.height - b.height)
  win.setBounds({ ...b, x, y })
  saveBounds()
}

function saveBounds(): void {
  if (!win) return
  updateSettings({ overlayBounds: win.getBounds() })
}

/** Restore saved bounds if they're still on a connected display; otherwise top-right of the primary display. */
function initialBounds(saved: Bounds | null): Bounds {
  if (saved) {
    const area = screen.getDisplayMatching(saved).workArea
    const visible =
      saved.x < area.x + area.width &&
      saved.x + saved.width > area.x &&
      saved.y < area.y + area.height &&
      saved.y + saved.height > area.y
    if (visible) return saved
  }
  const area = screen.getPrimaryDisplay().workArea
  return {
    ...DEFAULT_SIZE,
    x: area.x + area.width - DEFAULT_SIZE.width - MARGIN,
    y: area.y + MARGIN
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}
