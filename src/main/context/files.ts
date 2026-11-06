import type Anthropic from '@anthropic-ai/sdk'
import { app } from 'electron'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { ContextFile } from '../../shared/types'

// "Your own context": files you add in Settings (CV, product sheet, pricing, notes) are
// copied into Sotto's data folder and attached to every conversation, so answers are
// about you and your business. Text and markdown go in as text; PDFs go in as documents
// that Claude reads natively.

type ContentBlock = Anthropic.Beta.Messages.BetaContentBlockParam

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.csv', '.json'])
const MAX_TEXT_BYTES = 400_000
const MAX_PDF_BYTES = 20 * 1024 * 1024

export const CONTEXT_FILE_FILTERS = [{ name: 'Documents', extensions: ['pdf', 'txt', 'md', 'markdown', 'csv', 'json'] }]

const folder = (): string => join(app.getPath('userData'), 'context')

export function listContextFiles(): ContextFile[] {
  try {
    return readdirSync(folder())
      .filter((name) => !name.startsWith('.'))
      .sort()
      .map((name) => ({
        name,
        sizeKb: Math.ceil(statSync(join(folder(), name)).size / 1024),
        kind: extname(name).toLowerCase() === '.pdf' ? ('pdf' as const) : ('text' as const)
      }))
  } catch {
    return []
  }
}

/** Copy files in. Returns messages for files that were skipped. */
export function addContextFiles(paths: string[]): string[] {
  mkdirSync(folder(), { recursive: true })
  const problems: string[] = []
  for (const path of paths) {
    const ext = extname(path).toLowerCase()
    const size = statSync(path).size
    if (ext === '.pdf' ? size > MAX_PDF_BYTES : !TEXT_EXT.has(ext) || size > MAX_TEXT_BYTES) {
      problems.push(`${basename(path)}: ${TEXT_EXT.has(ext) || ext === '.pdf' ? 'too large' : 'unsupported type'}`)
      continue
    }
    copyFileSync(path, join(folder(), basename(path)))
  }
  return problems
}

export function removeContextFile(name: string): void {
  // Only a plain file name that's in the list: no "..", no paths.
  if (!listContextFiles().some((f) => f.name === name)) return
  rmSync(join(folder(), basename(name)), { force: true })
}

/** Content blocks for the first message of every conversation (cached by the API). */
export function contextBlocks(): ContentBlock[] {
  const blocks: ContentBlock[] = []
  for (const file of listContextFiles()) {
    const data = readFileSync(join(folder(), file.name))
    if (file.kind === 'pdf') {
      blocks.push({
        type: 'document',
        title: file.name,
        source: { type: 'base64', media_type: 'application/pdf', data: data.toString('base64') }
      })
    } else {
      blocks.push({ type: 'text', text: `<document name=${JSON.stringify(file.name)}>\n${data.toString('utf8')}\n</document>` })
    }
  }
  if (blocks.length) {
    blocks.unshift({ type: 'text', text: "Reference documents the user added about themselves and their work:" })
    // Cache everything up to here: the documents don't change during a conversation.
    const last = blocks[blocks.length - 1]
    blocks[blocks.length - 1] = { ...last, cache_control: { type: 'ephemeral' } } as ContentBlock
  }
  return blocks
}
