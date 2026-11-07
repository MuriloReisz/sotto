import { app, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { MOVE_STEP_PX, OVERLAY_WIDTH } from '../../shared/defaults'
import { clampInto, moveOverlayBounds, placeOverlay, topCenter } from '../../shared/geometry'
import { reactivatePreviousApp, rememberFrontmostApp, setPreventsActivation } from '../native/mac-focus'
import { devToolsAllowed, lockDownWebContents } from '../security'
import { getState, setState } from '../state'
import { getSettings, updateSettings } from '../store/settings'

// The overlay is a single always-on-top window, centred at the top of the screen. Its
// width is fixed and its height follows the content (the page reports it), so there is
// never an invisible area blocking clicks. Everything that makes it behave like an
// "assistant layer" rather than a normal window is set up here.

const TOP_MARGIN = 10
const BAR_HEIGHT = 64

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

/** The display under the mouse: where you're looking when you launch it. */
const activeArea = (): Electron.Rectangle => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea

export function createOverlayWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const bounds = placeOverlay(
    getSettings().overlayPosition,
    { width: OVERLAY_WIDTH, height: BAR_HEIGHT },
    workAreas(),
    activeArea(),
    TOP_MARGIN
  )

  win = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false, // the height follows the content
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true, // Windows: no taskbar button
    // macOS 'panel' = NSPanel: floats over full-screen apps. Windows 'toolbar' = tool
    // window: hidden from Alt-Tab.
    type: isMac ? 'panel' : 'toolbar',
    alwaysOnTop: true,
    // Not focusable by default, so clicking it doesn't take focus from the app behind.
    // Typing mode (below) turns focus on only while you type.
    focusable: false,
    // macOS: the first click on a non-focused window acts immediately.
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
  setPreventsActivation(win, true)

  // Hide the window from screen capture / sharing.
  //   macOS:   NSWindow.sharingType = .none
  //   Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE), Win10 2004+
  // See README > Screen-share invisibility for what has and hasn't been tested.
  win.setContentProtection(true)

  // 'screen-saver' is the highest always-on-top level: above full-screen apps and the Dock.
  win.setAlwaysOnTop(true, 'screen-saver')
  // Follow the user across Spaces / virtual desktops, including full-screen Spaces.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      hideOverlay()
    }
  })
  win.on('show', () => setState({ visible: true }))
  win.on('hide', () => setState({ visible: false }))
  // You clicked into another app while typing: just drop typing mode.
  win.on('blur', () => {
    if (getState().typing) exitTyping({ giveFocusBack: false })
  })
  win.on('moved', savePosition)

  // Packaged builds never load a dev server, even if the env var is set.
  const devUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(`${devUrl}/overlay/index.html`)
  else void win.loadFile(join(__dirname, '../renderer/overlay/index.html'))

  // Show without stealing keyboard focus from the app you're working in.
  win.once('ready-to-show', () => showOverlay())

  setState({ contentProtected: win.isContentProtected() })
  return win
}

export function showOverlay(): void {
  win?.showInactive()
}

export function hideOverlay(): void {
  if (getState().typing) exitTyping({ giveFocusBack: true })
  win?.hide()
}

export function toggleOverlay(): void {
  if (win?.isVisible()) hideOverlay()
  else showOverlay()
}

/** The page reports its content height; the window follows (top edge stays put). */
export function setOverlayHeight(height: number): void {
  if (!win) return
  const b = win.getBounds()
  const area = screen.getDisplayMatching(b).workArea
  const h = Math.round(Math.min(Math.max(height, 48), area.height * 0.85))
  if (h === b.height) return
  // Grow downwards, but if that would run off the bottom, slide up to stay on-screen.
  win.setBounds(clampInto({ x: b.x, y: b.y, width: OVERLAY_WIDTH, height: h }, area))
}

/**
 * Click-through: mouse events pass to whatever is underneath the overlay.
 * `forward: true` still delivers mouse-move events to the page, so hover styles work.
 */
export function setClickThrough(enabled: boolean): void {
  if (!win) return
  if (enabled && getState().typing) exitTyping({ giveFocusBack: true })
  win.setIgnoreMouseEvents(enabled, { forward: true })
  setState({ clickThrough: enabled })
}

/**
 * Typing mode: the overlay takes keyboard focus so you can type a question. On macOS
 * the app you were in is remembered and gets focus back when you finish.
 */
export function enterTyping(): void {
  if (!win || getState().typing) return
  if (getState().clickThrough) setClickThrough(false)
  showOverlay()
  rememberFrontmostApp()
  setPreventsActivation(win, false)
  win.setFocusable(true)
  if (process.platform === 'darwin') app.focus({ steal: true })
  win.focus()
  setState({ typing: true })
}

export function exitTyping({ giveFocusBack }: { giveFocusBack: boolean }): void {
  if (!win || !getState().typing) return
  setState({ typing: false })
  win.setFocusable(false)
  // On Windows, making a window focusable again can bring back its taskbar button.
  if (process.platform === 'win32') win.setSkipTaskbar(true)
  setPreventsActivation(win, true)
  if (giveFocusBack) reactivatePreviousApp()
}

/** Nudge the overlay; at a display edge it hops onto the neighbouring display, if any. */
export function moveOverlay(dx: -1 | 0 | 1, dy: -1 | 0 | 1): void {
  if (!win) return
  win.setBounds(moveOverlayBounds(win.getBounds(), dx, dy, workAreas(), MOVE_STEP_PX))
  savePosition()
}

/** Back to the top centre of the screen you're looking at. */
export function recenterOverlay(): void {
  if (!win) return
  const b = win.getBounds()
  win.setBounds(topCenter({ width: b.width, height: b.height }, activeArea(), TOP_MARGIN))
  savePosition()
}

function savePosition(): void {
  if (!win) return
  const { x, y } = win.getBounds()
  updateSettings({ overlayPosition: { x, y } })
}
