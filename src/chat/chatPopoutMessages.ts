import type { PeerHostChatLine } from '../net/protocol'

/** `postMessage` envelope so unrelated origins/extensions are ignored safely. */
export const CHAT_POPOUT_MESSAGE_SOURCE = 'card-game-room-chat' as const

export type ChatPopoutToMain =
  | { source: typeof CHAT_POPOUT_MESSAGE_SOURCE; type: 'chat-popout-ready' }
  | { source: typeof CHAT_POPOUT_MESSAGE_SOURCE; type: 'chat-outgoing'; text: string }

export type MainToChatPopout =
  | { source: typeof CHAT_POPOUT_MESSAGE_SOURCE; type: 'chat-sync'; lines: PeerHostChatLine[] }
  | { source: typeof CHAT_POPOUT_MESSAGE_SOURCE; type: 'chat-line'; line: PeerHostChatLine }

export function isChatPopoutToMain(data: unknown): data is ChatPopoutToMain {
  if (!data || typeof data !== 'object') return false
  const o = data as { source?: unknown; type?: unknown }
  if (o.source !== CHAT_POPOUT_MESSAGE_SOURCE) return false
  if (o.type === 'chat-popout-ready') return true
  if (o.type === 'chat-outgoing') {
    return typeof (data as { text?: unknown }).text === 'string'
  }
  return false
}

export function isMainToChatPopout(data: unknown): data is MainToChatPopout {
  if (!data || typeof data !== 'object') return false
  const o = data as { source?: unknown; type?: unknown }
  if (o.source !== CHAT_POPOUT_MESSAGE_SOURCE) return false
  if (o.type === 'chat-sync') {
    return Array.isArray((data as { lines?: unknown }).lines)
  }
  if (o.type === 'chat-line') {
    const line = (data as { line?: unknown }).line
    return !!line && typeof line === 'object' && (line as { type?: unknown }).type === 'chatLine'
  }
  return false
}
