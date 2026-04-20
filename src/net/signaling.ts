import {
  PROTOCOL_VERSION,
  isSignalingMessage,
  type SignalingHello,
  type SignalingMessage,
  type SignalingRelay,
  type SignalingRole,
} from './protocol'

export interface SignalingClientOptions {
  wsUrl: string
  role: SignalingRole
  roomCode: string
  token: string
  peerId: string
  onMessage: (message: SignalingMessage) => void
  onStateChange?: (state: SignalingState) => void
  /** Reconnect backoff in ms. Defaults grow from 500ms to 10s. */
  backoff?: (attempt: number) => number
}

export type SignalingState = 'connecting' | 'open' | 'closed' | 'reconnecting'

/**
 * WebSocket signaling client with automatic reconnection and a simple outbound queue.
 * Does not speak WebRTC itself — that's in {@link RoomHost}/{@link RoomClient}.
 */
export class SignalingClient {
  private ws: WebSocket | null = null
  private closedByUser = false
  private attempt = 0
  private state: SignalingState = 'connecting'
  private pending: string[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readonly opts: SignalingClientOptions

  constructor(opts: SignalingClientOptions) {
    this.opts = opts
    this.connect()
  }

  private setState(next: SignalingState) {
    this.state = next
    this.opts.onStateChange?.(next)
  }

  getState(): SignalingState {
    return this.state
  }

  private connect() {
    if (this.closedByUser) return
    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting')
    const ws = new WebSocket(this.opts.wsUrl)
    this.ws = ws
    ws.addEventListener('open', () => {
      this.attempt = 0
      this.setState('open')
      const hello: SignalingHello = {
        type: 'hello',
        version: PROTOCOL_VERSION,
        role: this.opts.role,
        roomCode: this.opts.roomCode,
        token: this.opts.token,
        peerId: this.opts.peerId,
      }
      ws.send(JSON.stringify(hello))
      while (this.pending.length > 0) {
        const msg = this.pending.shift()!
        ws.send(msg)
      }
    })
    ws.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(String(ev.data))
        if (isSignalingMessage(data)) {
          this.opts.onMessage(data)
        }
      } catch {
        // ignore malformed frames
      }
    })
    ws.addEventListener('close', () => {
      this.ws = null
      if (this.closedByUser) {
        this.setState('closed')
        return
      }
      this.scheduleReconnect()
    })
    ws.addEventListener('error', () => {
      // close handler is authoritative
    })
  }

  private scheduleReconnect() {
    this.attempt += 1
    const backoff = this.opts.backoff ?? defaultBackoff
    const delay = backoff(this.attempt)
    this.setState('reconnecting')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  /** Fire-and-forget send (queued while disconnected). */
  send(msg: SignalingRelay | SignalingMessage) {
    const json = JSON.stringify(msg)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(json)
    } else {
      this.pending.push(json)
      if (this.pending.length > 256) this.pending.shift()
    }
  }

  close() {
    this.closedByUser = true
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.setState('closed')
  }
}

function defaultBackoff(attempt: number): number {
  const base = 500
  const cap = 10_000
  const jitter = Math.floor(Math.random() * 250)
  return Math.min(cap, base * 2 ** Math.min(attempt, 6)) + jitter
}
