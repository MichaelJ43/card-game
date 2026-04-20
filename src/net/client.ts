import { PeerLink, type PeerState } from './peer'
import {
  type PeerClientIntent,
  type PeerClientSetDisplayName,
  type PeerHostSnapshot,
  type PeerMessage,
  type SignalingRelay,
} from './protocol'
import { SignalingClient, type SignalingState } from './signaling'

export interface RoomClientOptions {
  wsUrl: string
  roomCode: string
  hostPeerId: string
  clientPeerId: string
  token: string
  onSignalingState?: (state: SignalingState) => void
  onPeerState?: (state: PeerState) => void
  onSnapshot?: (snapshot: PeerHostSnapshot) => void
  onStatus?: (message: string) => void
  onAck?: (nonce: string, ok: boolean, error: string | undefined) => void
  /** Host closed the room or disconnected; stop signaling and data channel. */
  onHostEnded?: () => void
}

/**
 * Client side: dials the host, receives snapshots, and sends intents.
 */
export class RoomClient {
  private signaling: SignalingClient
  private link: PeerLink | null = null
  private readonly opts: RoomClientOptions

  constructor(opts: RoomClientOptions) {
    this.opts = opts
    this.signaling = new SignalingClient({
      wsUrl: opts.wsUrl,
      role: 'client',
      roomCode: opts.roomCode,
      token: opts.token,
      peerId: opts.clientPeerId,
      onStateChange: (s) => opts.onSignalingState?.(s),
      onMessage: (msg) => {
        if (msg.type === 'welcome') {
          this.ensureLink()
        } else if (msg.type === 'relay' && msg.to === opts.clientPeerId) {
          this.ensureLink().acceptSignal(msg.payload)
        } else if (msg.type === 'peer-left' && msg.peerId === opts.hostPeerId) {
          this.handleHostEnded()
        }
      },
    })
  }

  private ensureLink(): PeerLink {
    if (this.link) return this.link
    this.link = new PeerLink({
      remotePeerId: this.opts.hostPeerId,
      initiator: true,
      channelLabel: 'game',
      onStateChange: (s) => this.opts.onPeerState?.(s),
      onSignal: (payload) => {
        const relay: SignalingRelay = {
          type: 'relay',
          to: this.opts.hostPeerId,
          from: this.opts.clientPeerId,
          payload,
        }
        this.signaling.send(relay)
      },
      onPeerMessage: (msg) => this.handlePeerMessage(msg),
    })
    return this.link
  }

  private handleHostEnded(): void {
    this.link?.close()
    this.link = null
    this.signaling.close()
    this.opts.onHostEnded?.()
  }

  private handlePeerMessage(msg: PeerMessage) {
    if (msg.type === 'snapshot') this.opts.onSnapshot?.(msg)
    else if (msg.type === 'status') this.opts.onStatus?.(msg.message)
    else if (msg.type === 'ack') this.opts.onAck?.(msg.nonce, msg.ok, msg.error)
  }

  sendIntent(intent: Omit<PeerClientIntent, 'type'>): void {
    this.link?.send({ type: 'intent', ...intent })
  }

  sendSetDisplayName(body: Omit<PeerClientSetDisplayName, 'type'>): void {
    this.link?.send({ type: 'setDisplayName', ...body })
  }

  close(): void {
    this.link?.close()
    this.link = null
    this.signaling.close()
  }
}
