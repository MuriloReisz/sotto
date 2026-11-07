import { app } from 'electron'
import { askAboutScreen, focusChat, runQuickAction } from './actions'
import type { HotkeyHandlers } from './hotkeys'
import { initHotkeys, unregisterHotkeys } from './hotkeys'
import { registerIpcHandlers } from './ipc'
import { fakeModel } from './llm/client'
import { installAppMenu } from './menu'
import { restrictPermissions } from './security'
import { publishSettings } from './settings-view'
import { getState, initState, onStateChanged, setUiTarget, showView } from './state'
import { hasApiKey, loadApiKey } from './store/secrets'
import { flushSettings, getSettings } from './store/settings'
import { registerSystemAudioHandler, toggleListening } from './transcription/listening'
import { stopWhisperServer } from './transcription/whisper-server'
import { createTray, updateTray, type TrayActions } from './tray'
import {
  createOverlayWindow,
  markQuitting,
  moveOverlay,
  recenterOverlay,
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
  // The key is decrypted first (async keychain access), so everything after can read it.
  void app.whenReady().then(loadApiKey).then(start)
}

const hotkeyHandlers: HotkeyHandlers = {
  toggleOverlay,
  toggleClickThrough: () => setClickThrough(!getState().clickThrough),
  screenshot: () => void askAboutScreen(),
  toggleListening: () => void toggleListening(),
  focusChat,
  suggestReply: () => runQuickAction('whatToSay'),
  moveUp: () => moveOverlay(0, -1),
  moveDown: () => moveOverlay(0, 1),
  moveLeft: () => moveOverlay(-1, 0),
  moveRight: () => moveOverlay(1, 0)
}

const openView = (view: 'settings' | 'help') => (): void => {
  showOverlay()
  showView(view)
}

const trayActions: TrayActions = {
  toggleOverlay,
  toggleClickThrough: hotkeyHandlers.toggleClickThrough,
  recenter: recenterOverlay,
  openSettings: openView('settings'),
  openHelp: openView('help'),
  quit: () => app.quit()
}

function start(): void {
  // No Dock icon on macOS (the packaged app also sets LSUIElement).
  if (process.platform === 'darwin') app.dock?.hide()

  const settings = getSettings()
  initState({
    platform: process.platform as 'darwin' | 'win32' | 'linux',
    visible: false,
    clickThrough: false,
    typing: false,
    contentProtected: false,
    hotkeys: settings.hotkeys,
    hotkeyErrors: [],
    listening: null,
    busy: false,
    notesStatus: 'idle',
    opacity: settings.opacity,
    hasApiKey: hasApiKey(),
    onboarded: settings.onboarded,
    fakeModel: fakeModel()
  })

  installAppMenu()
  restrictPermissions()
  registerSystemAudioHandler()
  registerIpcHandlers()
  const overlay = createOverlayWindow()
  setUiTarget(overlay.webContents)
  overlay.webContents.once('did-finish-load', () => publishSettings())

  // Registers now and again whenever the hotkeys change in settings (the editor).
  initHotkeys(hotkeyHandlers)

  createTray(trayActions, getState())
  onStateChanged((state) => updateTray(trayActions, state))
}

app.on('before-quit', () => {
  markQuitting()
  flushSettings()
  stopWhisperServer()
})
app.on('will-quit', () => unregisterHotkeys())
// Hiding the overlay must not quit the app; only the tray "Quit" does.
app.on('window-all-closed', () => {})
