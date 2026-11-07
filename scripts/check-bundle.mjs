// Fails the build if the renderer bundle contains inline (data:) scripts.
// The packaged page's Content-Security-Policy is `script-src 'self'`, which blocks them.
// Vite inlines small `?url` imports as data: URLs, so the audio worklet once shipped that
// way: listening worked in dev (served over http) and silently did nothing when installed.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const dir = join(process.cwd(), 'out', 'renderer', 'assets')
const bad = readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .filter((f) => /data:(text|application)\/javascript/.test(readFileSync(join(dir, f), 'utf8')))

if (bad.length > 0) {
  process.stderr.write(`Inline data: scripts found in ${bad.join(', ')}. The packaged CSP blocks them; import with ?url&no-inline.\n`)
  process.exit(1)
}
const worklets = readdirSync(dir).filter((f) => f.startsWith('pcm-worklet'))
if (worklets.length === 0) {
  process.stderr.write('pcm-worklet was not emitted as a file in out/renderer/assets.\n')
  process.exit(1)
}
process.stdout.write(`bundle ok (${worklets.join(', ')})\n`)
