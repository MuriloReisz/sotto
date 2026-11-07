#!/usr/bin/env node
// Packaging helper (npm run dist:mac): puts koffi's prebuilt native module for every macOS
// architecture we ship into node_modules/.cache/sotto-koffi/darwin_<arch>/koffi.node.
//
// npm only installs the koffi binary for the machine it runs on (@koromix/koffi-darwin-arm64
// on Apple Silicon), but the Intel build needs @koromix/koffi-darwin-x64. electron-builder
// copies the matching file into Sotto.app/Contents/Resources/koffi/darwin_<arch>/, which is
// one of the places koffi looks when it runs inside a packaged Electron app.
//
// The x64 package is fetched with `npm pack` (no install scripts run; npm checks the
// registry integrity hash) at exactly the installed koffi version, then cached.

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { log } from 'node:console'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'node_modules/koffi/package.json'), 'utf8'))
const cache = join(root, 'node_modules/.cache/sotto-koffi')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

for (const arch of ['arm64', 'x64']) {
  const triplet = `darwin_${arch}`
  const dest = join(cache, version, triplet, 'koffi.node')
  if (existsSync(dest)) {
    log(`[koffi] ${triplet} ${version}: cached`)
    continue
  }
  mkdirSync(dirname(dest), { recursive: true })

  // Use the copy npm already installed when it is this machine's architecture.
  const installed = join(root, `node_modules/@koromix/koffi-darwin-${arch}/${triplet}/koffi.node`)
  if (existsSync(installed)) {
    copyFileSync(installed, dest)
    log(`[koffi] ${triplet} ${version}: copied from node_modules`)
    continue
  }

  const work = mkdtempSync(join(tmpdir(), 'sotto-koffi-'))
  try {
    const spec = `@koromix/koffi-darwin-${arch}@${version}`
    const tarball = execFileSync(npm, ['pack', spec, '--silent', '--pack-destination', work], {
      cwd: work,
      encoding: 'utf8'
    }).trim().split('\n').pop()
    execFileSync('tar', ['-xzf', join(work, tarball), '-C', work, `package/${triplet}/koffi.node`])
    copyFileSync(join(work, 'package', triplet, 'koffi.node'), dest)
    log(`[koffi] ${triplet} ${version}: fetched ${spec}`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
