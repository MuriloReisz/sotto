import { app, Menu, type MenuItemConstructorOptions } from 'electron'

/**
 * Replace Electron's default menu. The default one adds shortcuts that are risky in an
 * overlay: Cmd/Ctrl+R reloads it, Alt+Cmd+I opens DevTools (a window screen shares CAN
 * see), Cmd+H hides the app behind our back. We keep only Edit (copy/paste/select all in
 * text fields) and, on macOS, Quit. With no Dock icon the menu bar is never shown; these
 * items only provide keyboard shortcuts while the overlay is focused.
 */
export function installAppMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{ label: app.name, submenu: [{ role: 'quit' as const }] }]
      : []),
    { role: 'editMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
