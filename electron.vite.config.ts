import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// electron-vite builds three targets:
//   main     -> out/main/index.js      (Node, Electron main process)
//   preload  -> out/preload/index.js   (bridge between main and the page)
//   renderer -> out/renderer/**        (React UI, one HTML entry per window)
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react(), contentSecurityPolicy()],
    build: {
      rollupOptions: {
        input: {
          overlay: resolve('src/renderer/overlay/index.html')
        }
      }
    }
  }
})

/**
 * Adds a Content-Security-Policy <meta> tag to every page.
 * Production: only our own bundled scripts may run, so injected or remote code is blocked.
 * Dev: also allows the inline React Fast Refresh preamble and Vite's HMR websocket,
 * which the strict policy would block (the result would be a blank overlay).
 * No page ever needs network access: every API call is made by the main process.
 */
function contentSecurityPolicy(): Plugin {
  let isDev = false
  return {
    name: 'veil:csp',
    configResolved(config) {
      isDev = config.command === 'serve'
    },
    transformIndexHtml() {
      const policy = [
        "default-src 'self'",
        isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        isDev ? "connect-src 'self' ws://localhost:* http://localhost:*" : "connect-src 'self'"
      ].join('; ')
      return [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }
      ]
    }
  }
}
