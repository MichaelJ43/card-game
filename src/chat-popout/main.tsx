import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import type { PeerHostChatLine } from '../net/protocol'
import {
  CHAT_POPOUT_MESSAGE_SOURCE,
  isMainToChatPopout,
  type ChatPopoutToMain,
} from '../chat/chatPopoutMessages'
import { useChatToasts } from '../chat/useChatToasts'
import { ChatToastStack } from '../ui/ChatToastStack'
import './chat-popout.css'

function ChatPopoutApp() {
  const openerRef = useRef<Window | null>(null)
  const [lines, setLines] = useState<PeerHostChatLine[]>([])
  const [draft, setDraft] = useState('')
  const [noOpener, setNoOpener] = useState(() => typeof window !== 'undefined' && !window.opener)
  const { toasts, pushToast, clearToasts } = useChatToasts(5, 3000)

  const postToOpener = useCallback((msg: ChatPopoutToMain) => {
    const target = openerRef.current
    if (!target || target.closed) return
    target.postMessage(msg, window.location.origin)
  }, [])

  useEffect(() => {
    const o = window.opener as Window | null
    openerRef.current = o
    if (!o) {
      setNoOpener(true)
      return
    }
    postToOpener({ source: CHAT_POPOUT_MESSAGE_SOURCE, type: 'chat-popout-ready' })
  }, [postToOpener])

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return
      if (!isMainToChatPopout(ev.data)) return
      if (ev.data.type === 'chat-sync') {
        setLines(ev.data.lines)
        clearToasts()
        return
      }
      const { line } = ev.data
      setLines((prev) => [...prev, line].slice(-200))
      pushToast({ id: line.id, senderLabel: line.senderLabel, text: line.text })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [pushToast, clearToasts])

  const send = useCallback(() => {
    const t = draft.trim()
    if (!t) return
    postToOpener({ source: CHAT_POPOUT_MESSAGE_SOURCE, type: 'chat-outgoing', text: draft })
    setDraft('')
  }, [draft, postToOpener])

  if (noOpener) {
    return (
      <div className="chatPopout">
        <div className="chatPopout__header">Room chat</div>
        <p className="chatPopout__blocked">
          This page must be opened from the card table with <strong>Open chat</strong>. If you opened it manually,
          close this tab and use the button in the main game window.
        </p>
      </div>
    )
  }

  return (
    <div className="chatPopout">
      <div className="chatPopout__header">Room chat</div>
      <div className="chatPopout__transcript" aria-label="Chat transcript">
        {lines.length === 0 ? (
          <p className="chatPopout__hint">No messages yet.</p>
        ) : (
          lines.map((l) => (
            <div key={l.id} className="chatPopout__line">
              <div className="chatPopout__meta">
                <span className="chatPopout__sender">{l.senderLabel}</span>
                <span> · </span>
                <time dateTime={new Date(l.ts).toISOString()}>{new Date(l.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              </div>
              <div>{l.text}</div>
            </div>
          ))
        )}
      </div>
      <div className="chatPopout__composer">
        <input
          className="chatPopout__input"
          type="text"
          maxLength={500}
          placeholder="Message (max 140 after send)"
          value={draft}
          aria-label="Chat message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button type="button" className="chatPopout__send" onClick={send}>
          Send
        </button>
      </div>
      <p className="chatPopout__hint">Messages are not stored on the server and disappear when the room closes.</p>
      <ChatToastStack toasts={toasts} />
    </div>
  )
}

const el = document.getElementById('chat-popout-root')
if (el) {
  createRoot(el).render(<ChatPopoutApp />)
}
