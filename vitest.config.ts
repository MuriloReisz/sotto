import { defineConfig } from 'vitest/config'

// Unit tests cover pure logic only (no Electron), so they run in plain Node.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
})
