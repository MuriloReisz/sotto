import { useEffect, useRef, useState } from 'react'
import { QUICK_ACTIONS } from '../../../shared/defaults'
import { formatAccelerator } from '../../../shared/hotkey-format'
import type { ChatItem, OverlayState, QuickAction } from '../../../shared/types'
import { useChat } from '../hooks'
import { Icon } from './Icon'
import { Markdown } from './Markdown'

export function ChatView({ state }: { state: OverlayState }): React.JSX.Element {
  const items = useChat()
  const listRef = useRef<HTMLDivElement>(null)
  const key = (a: keyof OverlayState['hotkeys']): string => formatAccelerator(state.hotkeys[a], state.platform)

  // Keep the newest text in view while it streams.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items])

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef}>
        {items.length === 0 ? (
          <div className="empty">
            <p className="empty-title">Ask anything, or let Sotto look.</p>
            <p>
              Press <kbd>{key('screenshot')}</kbd> to ask about your screen, or type below. While listening to a call, the
              buttons underneath answer from the live conversation.
            </p>
          </div>
        ) : (
          items.map((item) => <Message key={item.id} item={item} />)
        )}
      </div>

      <QuickActions listening={Boolean(state.listening)} busy={state.busy} />
      <Composer state={state} hasItems={items.length > 0} />
    </div>
  )
}

function Message({ item }: { item: ChatItem }): React.JSX.Element {
  if (item.role === 'user') {
    return (
      <div className="msg msg-user">
        {item.thumbnail && <img className="msg-thumb" src={item.thumbnail} alt="Screenshot sent with this question" />}
        <div className="msg-user-text">
          {item.label && item.label !== item.text && <span className="msg-label">{item.label}</span>}
          <p>{item.text}</p>
        </div>
      </div>
    )
  }
  return (
    <div className={`msg msg-ai is-${item.status}`}>
      {item.text ? <Markdown text={item.text} /> : <span className="thinking">Thinking</span>}
      {item.status === 'stopped' && <p className="msg-note">Stopped.</p>}
      {item.status === 'done' && item.text && (
        <button type="button" className="msg-copy" onClick={() => window.sotto.copyText(item.text)} title="Copy answer">
          <Icon name="copy" size={14} /> Copy
        </button>
      )}
    </div>
  )
}

function QuickActions({ listening, busy }: { listening: boolean; busy: boolean }): React.JSX.Element {
  return (
    <div className="quick" role="group" aria-label="Quick actions for calls">
      {(Object.keys(QUICK_ACTIONS) as QuickAction[]).map((action) => (
        <button
          key={action}
          type="button"
          className="chip"
          disabled={busy}
          onClick={() => window.sotto.quickAction(action)}
          title={listening ? 'Answer from the live conversation' : 'Start listening first: these use the live conversation'}
        >
          {QUICK_ACTIONS[action].label}
        </button>
      ))}
    </div>
  )
}

function Composer({ state, hasItems }: { state: OverlayState; hasItems: boolean }): React.JSX.Element {
  const [text, setText] = useState('')
  const send = (): void => {
    if (!text.trim()) return
    window.sotto.send(text)
    setText('')
    // Hand focus back to the app you were in; the answer streams in on its own.
    window.sotto.setTyping(false)
  }
  return (
    <div className={`composer ${state.typing ? 'is-typing' : ''}`}>
      <textarea
        data-autofocus
        rows={1}
        value={text}
        placeholder={state.typing ? 'Ask a question… (Enter to send, Esc to go back)' : 'Click to type a question'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
      />
      {state.busy ? (
        <button type="button" className="send" onClick={() => window.sotto.stop()} title="Stop the answer" aria-label="Stop">
          <Icon name="stop" />
        </button>
      ) : (
        <button type="button" className="send" onClick={send} disabled={!text.trim()} title="Send" aria-label="Send">
          <Icon name="send" />
        </button>
      )}
      {hasItems && (
        <button type="button" className="link-btn" onClick={() => window.sotto.newChat()} title="Forget this conversation and start fresh">
          New chat
        </button>
      )}
    </div>
  )
}
