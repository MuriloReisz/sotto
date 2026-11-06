import type Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { IPC } from '../../shared/ipc'
import type { ChatItem } from '../../shared/types'
import { contextBlocks } from '../context/files'
import { fallback, fakeModel, friendlyError, getClient } from '../llm/client'
import { fakeStream } from '../llm/fake'
import { systemBlocks, userTurnText } from '../llm/prompts'
import { getState, sendToUi, setState, showView } from '../state'
import { getSettings } from '../store/settings'

// The conversation with Claude. Two parallel records:
//   items   - what the chat panel shows (text, thumbnails, status)
//   history - exactly what was sent to / received from the API, append-only, so the
//             cached prefix stays valid and replayed thinking blocks stay untouched.
//
// Caching: the system prompt and your files carry their own cache breakpoints, and the
// request-level `cache_control` caches the whole conversation up to the newest message,
// so a follow-up only pays full price for what's new (3 of the 4 allowed breakpoints).

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam
type ContentBlock = Anthropic.Beta.Messages.BetaContentBlockParam
type Effort = 'low' | 'medium' | 'high'

let items: ChatItem[] = []
let history: MessageParam[] = []
let running: AbortController | null = null
/** Bumped by newChat(), so an answer still finishing can't reappear in a cleared chat. */
let chatGeneration = 0

export function getChat(): ChatItem[] {
  return items
}

function emit(item: ChatItem, generation: number): void {
  if (generation !== chatGeneration) return
  const i = items.findIndex((x) => x.id === item.id)
  if (i === -1) items = [...items, item]
  else items = items.map((x) => (x.id === item.id ? item : x))
  sendToUi(IPC.chatItem, item)
}

export interface AskOptions {
  /** The question as shown in the chat. */
  text: string
  /** The question as sent to Claude, if different (e.g. a longer quick-action prompt). */
  prompt?: string
  label?: string
  image?: { base64: string; thumbnail: string }
  /** Live transcript to include with this question. */
  transcript?: string
  /** Extra material for this question only (e.g. past meeting notes). */
  extra?: string
  /** A one-off question: answered with the conversation so far, but not added to it
   *  (used for large one-off context such as all past meetings). */
  oneOff?: boolean
  effort?: Effort
}

export async function ask(options: AskOptions): Promise<void> {
  stop() // a new question replaces any answer still being written
  showView('chat')
  const generation = chatGeneration

  const client = getClient()
  if (!client && !fakeModel()) {
    emit(errorItem('Add your Anthropic API key in Settings to start asking questions.'), generation)
    showView('settings')
    return
  }

  emit(
    {
      id: randomUUID(),
      role: 'user',
      text: options.text,
      label: options.label,
      thumbnail: options.image?.thumbnail,
      status: 'done',
      at: Date.now()
    },
    generation
  )
  const answer: ChatItem = { id: randomUUID(), role: 'assistant', text: '', status: 'streaming', at: Date.now() }
  emit({ ...answer }, generation)

  const controller = new AbortController()
  running = controller
  setState({ busy: true })

  // Batch UI updates: re-render at most every 40 ms while text streams in.
  let flushTimer: NodeJS.Timeout | null = null
  const scheduleFlush = (): void => {
    flushTimer ??= setTimeout(() => {
      flushTimer = null
      emit({ ...answer }, generation)
    }, 40)
  }

  try {
    const userMessage: MessageParam = { role: 'user', content: buildContent(options, history.length === 0) }
    let finalContent: ContentBlock[]
    let keep = true
    if (!client) {
      for await (const delta of fakeStream(options.text, controller.signal)) {
        answer.text += delta
        scheduleFlush()
      }
      finalContent = [{ type: 'text', text: answer.text }]
    } else {
      const settings = getSettings()
      const stream = client.beta.messages.stream(
        {
          model: settings.model,
          max_tokens: 64_000,
          system: systemBlocks(settings),
          messages: [...history, userMessage],
          cache_control: { type: 'ephemeral' },
          output_config: { effort: options.effort ?? 'medium' },
          ...fallback()
        },
        { signal: controller.signal }
      )
      stream.on('streamEvent', (event) => {
        // The model declined mid-answer and a fallback model takes over: show only the new answer.
        if (event.type === 'content_block_start' && event.content_block.type === 'fallback') {
          answer.text = ''
          scheduleFlush()
        }
      })
      stream.on('text', (delta) => {
        answer.text += delta
        scheduleFlush()
      })
      const final = await stream.finalMessage()
      if (final.stop_reason === 'refusal') {
        answer.text += `${answer.text ? '\n\n' : ''}_Claude declined to answer this request._`
        keep = false // don't build later turns on a declined exchange
      } else if (final.stop_reason === 'max_tokens') {
        answer.text += '\n\n_The answer was cut off because it hit the length limit._'
      }
      finalContent = final.content as ContentBlock[]
    }
    if (controller.signal.aborted) throw new DOMException('stopped', 'AbortError')
    if (keep && !options.oneOff && generation === chatGeneration) {
      history = [...history, userMessage, { role: 'assistant', content: finalContent }]
    }
    answer.status = 'done'
  } catch (error) {
    if (controller.signal.aborted) {
      answer.status = 'stopped'
    } else {
      answer.status = 'error'
      answer.text = friendlyError(error)
    }
  } finally {
    if (flushTimer) clearTimeout(flushTimer)
    emit({ ...answer }, generation)
    if (running === controller) {
      running = null
      setState({ busy: false })
    }
  }
}

/** The user turn: your files (first turn only), screenshot, then transcript/extra + question. */
function buildContent(options: AskOptions, firstTurn: boolean): ContentBlock[] {
  const content: ContentBlock[] = []
  if (firstTurn) content.push(...contextBlocks())
  if (options.image) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: options.image.base64 } })
  }
  content.push({
    type: 'text',
    text: userTurnText(options.prompt ?? options.text, { transcript: options.transcript, extra: options.extra })
  })
  return content
}

/** Stop the answer being written (keeps what arrived so far). */
export function stop(): void {
  running?.abort()
  running = null
  if (getState()?.busy) setState({ busy: false })
}

export function newChat(): void {
  stop()
  chatGeneration++
  items = []
  history = []
  sendToUi(IPC.chatReset)
}

function errorItem(text: string): ChatItem {
  return { id: randomUUID(), role: 'assistant', text, status: 'error', at: Date.now() }
}
