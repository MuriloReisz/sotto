import { app } from 'electron'
import type { HotkeyHandlers } from './hotkeys'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { registerIpcHandlers } from './ipc'
import { installAppMenu } from './menu'
import { restrictPermissions } from './security'
import { getState, initState, onStateChanged, setState, setStateTarget, toast } from './state'
import { flushSettings, getSettings, onSettingsChanged } from './store/settings'
import { createTray, updateTray, type TrayActions } from './tray'
import {
  createOverlayWindow,
  markQuitting,
  moveOverlay,
  setClickThrough,
  showOverlay,
  toggleOverlay
} from './windows/overlay'

// Entry point of the Electron main process: wires the window, hotkeys, tray and IPC together.

// An uncaught error in the main process normally makes Electron show a native error
// dialog, which is NOT hidden from screen sharing. Log instead and keep running.
process.on('uncaughtException', (error) => console.error('[sotto] uncaught exception:', error))
process.on('unhandledRejection', (reason) => console.error('[sotto] unhandled rejection:', reason))

// Only one Sotto at a time; a second launch just shows the existing overlay.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showOverlay())
  void app.whenReady().then(start)
}

/** Hotkey -> action map. Actions for later milestones show a placeholder message for now. */
const hotkeyHandlers: HotkeyHandlers = {
  toggleOverlay,
  toggleClickThrough: () => setClickThrough(!getState().clickThrough),
  screenshot: () => comingSoon('Screenshot → Claude', 'M2'),
  toggleListening: () => comingSoon('Live listening', 'M4'),
  suggestReply: () => comingSoon('"What should I say?"', 'M4'),
  moveUp: () => moveOverlay(0, -1),
  moveDown: () => moveOverlay(0, 1),
  moveLeft: () => moveOverlay(-1, 0),
  moveRight: () => moveOverlay(1, 0)
}

const trayActions: TrayActions = {
  toggleOverlay,
  toggleClickThrough: hotkeyHandlers.toggleClickThrough,
  quit: () => app.quit()
}

function start(): void {
  // No Dock icon on macOS (the packaged app also sets LSUIElement, M5).
  if (process.platform === 'darwin') app.dock?.hide()

  const settings = getSettings()
  initState({
    platform: process.platform as 'darwin' | 'win32' | 'linux',
    visible: false,
    clickThrough: false,
    listening: false,
    contentProtected: false,
    hotkeys: settings.hotkeys,
    hotkeyErrors: []
  })

  installAppMenu()
  restrictPermissions()
  registerIpcHandlers()
  const overlay = createOverlayWindow()
  setStateTarget(overlay.webContents)

  applyHotkeys()
  onSettingsChanged((next) => {
    // Re-register only when the bindings actually changed (bounds saves happen often).
    if (JSON.stringify(next.hotkeys) !== JSON.stringify(getState().hotkeys)) applyHotkeys()
  })

  createTray(trayActions, getState())
  onStateChanged((state) => updateTray(trayActions, state))
}

function applyHotkeys(): void {
  const { hotkeys } = getSettings()
  const hotkeyErrors = registerHotkeys(hotkeys, hotkeyHandlers)
  setState({ hotkeys, hotkeyErrors })
  for (const e of hotkeyErrors) console.warn(`[hotkeys] ${e.action} (${e.accelerator}): ${e.reason}`)
}

function comingSoon(feature: string, milestone: string): void {
  showOverlay()
  toast(`${feature} arrives in ${milestone}.`)
}

app.on('before-quit', () => {
  markQuitting()
  flushSettings()
})
app.on('will-quit', () => unregisterHotkeys())
// Hiding the overlay must not quit the app; only the tray "Quit" does.
app.on('window-all-closed', () => {})
