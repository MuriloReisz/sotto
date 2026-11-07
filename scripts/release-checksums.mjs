#!/usr/bin/env node
// Release helper (npm run release:sums): writes release/<version>/SHA256SUMS, one
// `<sha256>  <file>` line (the format of `shasum -a 256`) for each release asset in that
// folder. Run it after `npm run dist:mac`, then attach SHA256SUMS to the GitHub release
// with the mac files. The Windows CI job (.github/workflows/release.yml) later adds the
// Sotto-win-x64.exe line and re-uploads the file. The installers (install.sh, install.ps1)
// refuse a download whose hash isn't listed here.
//
// Usage: node scripts/release-checksums.mjs [folder]   (default: release/<package.json version>)

import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { error, log } from 'node:console'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const dir = resolve(process.argv[2] ?? join(root, 'release', version))

// The assets the installers and the README point at. Blockmaps, builder logs and the
// unpacked .app folders are not release assets.
const assetPattern = /^Sotto-(mac-(arm64|x64)\.(zip|dmg)|win-x64\.exe)$/
const required = ['Sotto-mac-arm64.zip', 'Sotto-mac-x64.zip']

function sha256(file) {
  return new Promise((done, failed) => {
    const hash = createHash('sha256')
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => done(hash.digest('hex')))
      .on('error', failed)
  })
}

if (!existsSync(dir)) {
  error(`[sums] ${dir} does not exist. Run npm run dist:mac first.`)
  process.exit(1)
}

const files = readdirSync(dir)
  .filter((name) => assetPattern.test(name) && statSync(join(dir, name)).isFile())
  .sort()
const missing = required.filter((name) => !files.includes(name))
if (missing.length > 0) {
  error(`[sums] Missing in ${dir}: ${missing.join(', ')}. Run npm run dist:mac first.`)
  process.exit(1)
}

const lines = []
for (const name of files) {
  lines.push(`${await sha256(join(dir, name))}  ${name}`)
}
const out = join(dir, 'SHA256SUMS')
writeFileSync(out, `${lines.join('\n')}\n`)
log(`[sums] wrote ${out}:`)
log(lines.join('\n'))
