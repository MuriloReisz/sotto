// Puts koffi's Windows x64 binary into node_modules so a Windows build can be made on a Mac
// (`npm run dist:win:local`). npm only installs the binary for the machine it runs on.
// `npm pack` downloads the package tarball (checked against the registry hash) without
// running any install scripts.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const target = join(root, 'node_modules', '@koromix', 'koffi-win32-x64')
const version = JSON.parse(readFileSync(join(root, 'node_modules', 'koffi', 'package.json'), 'utf8')).version

if (existsSync(join(target, 'win32_x64', 'koffi.node'))) {
  process.stdout.write(`koffi win32-x64 ${version} already present\n`)
} else {
  const tmp = mkdtempSync(join(tmpdir(), 'koffi-win-'))
  try {
    execFileSync('npm', ['pack', `@koromix/koffi-win32-x64@${version}`, '--silent'], { cwd: tmp, stdio: 'inherit' })
    const tgz = readdirSync(tmp).find((f) => f.endsWith('.tgz'))
    if (!tgz) throw new Error('npm pack produced no tarball')
    mkdirSync(target, { recursive: true })
    execFileSync('tar', ['-xzf', join(tmp, tgz), '-C', target, '--strip-components=1'])
    process.stdout.write(`koffi win32-x64 ${version} added\n`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
