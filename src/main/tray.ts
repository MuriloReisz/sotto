import { Menu, Tray, nativeImage, type NativeImage } from 'electron'
import { formatAccelerator } from '../shared/hotkey-format'
import type { OverlayState } from '../shared/types'

// With the Dock icon hidden, the menu-bar (macOS) / system-tray (Windows) icon is the
// only always-reachable way to show the overlay or quit the app.

export interface TrayActions {
  toggleOverlay: () => void
  toggleClickThrough: () => void
  quit: () => void
}

let tray: Tray | null = null

export function createTray(actions: TrayActions, state: OverlayState): Tray {
  tray = new Tray(drawIcon(process.platform === 'darwin'))
  tray.setToolTip('Sotto')
  updateTray(actions, state)
  return tray
}

export function updateTray(actions: TrayActions, state: OverlayState): void {
  if (!tray) return
  const key = (accel: string): string => (accel ? `  (${formatAccelerator(accel, state.platform)})` : '')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `${state.visible ? 'Hide' : 'Show'} overlay${key(state.hotkeys.toggleOverlay)}`,
        click: actions.toggleOverlay
      },
      {
        label: `Click-through${key(state.hotkeys.toggleClickThrough)}`,
        type: 'checkbox',
        checked: state.clickThrough,
        click: actions.toggleClickThrough
      },
      { type: 'separator' },
      { label: 'Settings… (coming in M5)', enabled: false },
      { type: 'separator' },
      { label: 'Quit Sotto', click: actions.quit }
    ])
  )
}

/**
 * Draw the tray icon in code (a ring with a dot) so there's no image asset to manage.
 * macOS: black "template" image that the OS recolours for light/dark menu bars.
 * Windows: white, for the usually dark taskbar.
 */
function drawIcon(isMac: boolean): NativeImage {
  const size = 32 // drawn at 2x, displayed at 16x16 pt
  const buf = Buffer.alloc(size * size * 4) // BGRA
  const c = (size - 1) / 2
  const shade = isMac ? 0 : 255
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c)
      const ring = 1 - Math.min(1, Math.abs(d - 11.5) / 2) // ring of radius ~11.5px, 4px wide
      const dot = 1 - Math.min(1, Math.max(0, d - 3.5)) // filled dot of radius ~4px
      const alpha = Math.round(255 * Math.max(ring, dot))
      const i = (y * size + x) * 4
      buf[i] = shade
      buf[i + 1] = shade
      buf[i + 2] = shade
      buf[i + 3] = alpha
    }
  }
  const image = nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 })
  if (isMac) image.setTemplateImage(true)
  return image
}
