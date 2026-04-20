import { PeerLink, type PeerState } from './peer'
import {
  PROTOCOL_VERSION,
  type PeerClientIntent,
  type PeerClientSetDisplayName,
  type PeerHostSnapshot,
  type PeerMessage,
  type SignalingRelay,
} from './protocol'
import { SignalingClient, type SignalingState } from './signaling'

export interface HostedPeer {
  peerId: string
  seat: number
  state: PeerState
}

export interface RoomHostOptions {
  wsUrl: string
  roomCode: string
  hostPeerId: string
  token: string
  onRosterChange?: (peers: HostedPeer[]) => void
  onSignalingState?: (state: SignalingState) => void
  /** Game intents and auxiliary seat updates from clients. */
  onIntent?: (msg: PeerClientIntent | PeerClientSetDisplayName, fromPeerId: string) => void
}

interface HostPeerRecord {
  peerId: string
  seat: number
  link: PeerLink
  state: PeerState
}

/**
 * Host side: opens a signaling WebSocket, accepts WebRTC offers from clients,
 * assigns them seats 1..N, and broadcasts state snapshots.
 */
export class RoomHost {
  private signaling: SignalingClient
  private peers = new Map<string, HostPeerRecord>()
  private revision = 0
  private readonly opts: RoomHostOptions

  constructor(opts: RoomHostOptions) {
    this.opts = opts
    this.signaling = new SignalingClient({
      wsUrl: opts.wsUrl,
      role: 'host',
      roomCode: opts.roomCode,
      token: opts.token,
      peerId: opts.hostPeerId,
      onStateChange: (s) => opts.onSignalingState?.(s),
      onMessage: (msg) => {
        if (msg.type === 'peer-joined') {
          this.addClient(msg.peerId)
        } else if (msg.type === 'peer-left') {
          this.removeClient(msg.peerId)
        } else if (msg.type === 'relay' && msg.to === opts.hostPeerId) {
          this.peers.get(msg.from)?.link.acceptSignal(msg.payload)
        } else if (msg.type === 'welcome' && msg.clientPeerIds) {
          for (const id of msg.clientPeerIds) this.addClient(id)
        }
      },
    })
  }

  private emitRoster() {
    const roster: HostedPeer[] = []
    for (const r of this.peers.values()) {
      roster.push({ peerId: r.peerId, seat: r.seat, state: r.state })
    }
    this.opts.onRosterChange?.(roster)
  }

  private nextFreeSeat(): number {
    const used = new Set<number>([0])
    for (const r of this.peers.values()) used.add(r.seat)
    let seat = 1
    while (used.has(seat)) seat++
    return seat
  }

  private addClient(peerId: string) {
    if (this.peers.has(peerId)) return
    const seat = this.nextFreeSeat()
    const link = new PeerLink({
      remotePeerId: peerId,
      initiator: false,
      channelLabel: 'game',
      onSignal: (payload) => {
        const relay: SignalingRelay = {
          type: 'relay',
          to: peerId,
          from: this.opts.hostPeerId,
          payload,
        }
        this.signaling.send(relay)
      },
      onPeerMessage: (msg) => this.handlePeerMessage(msg, peerId),
      onStateChange: (state) => {
        const rec = this.peers.get(peerId)
        if (rec) {
          rec.state = state
          this.emitRoster()
        }
      },
    })
    const record: HostPeerRecord = { peerId, seat, link, state: link.getState() }
    this.peers.set(peerId, record)
    this.emitRoster()
  }

  private removeClient(peerId: string) {
    const rec = this.peers.get(peerId)
    if (!rec) return
    rec.link.close()
    this.peers.delete(peerId)
    this.emitRoster()
  }

  private handlePeerMessage(msg: PeerMessage, fromPeerId: string) {
    if (msg.type === 'intent' || msg.type === 'setDisplayName') {
      this.opts.onIntent?.(msg, fromPeerId)
    } else if (msg.type === 'ping') {
      const rec = this.peers.get(fromPeerId)
      rec?.link.send({ type: 'pong', t: msg.t })
    }
  }

  /**
   * Broadcast a state snapshot to all clients. `stateForSeat` is called once per seat
   * so the host may redact hidden information (e.g. opponent hands) per recipient.
   */
  broadcastSnapshot(stateForSeat: (seat: number) => unknown): void {
    this.revision += 1
    for (const rec of this.peers.values()) {
      const snapshot: PeerHostSnapshot = {
        type: 'snapshot',
        rev: this.revision,
        seat: rec.seat,
        state: stateForSeat(rec.seat),
      }
      rec.link.send(snapshot)
    }
  }

  ack(fromPeerId: string, nonce: string, ok: boolean, error?: string): void {
    const rec = this.peers.get(fromPeerId)
    rec?.link.send({ type: 'ack', nonce, ok, error })
  }

  status(message: string): void {
    for (const rec of this.peers.values()) {
      rec.link.send({ type: 'status', message })
    }
  }

  getProtocolVersion(): number {
    return PROTOCOL_VERSION
  }

  getRoster(): HostedPeer[] {
    return Array.from(this.peers.values()).map((r) => ({
      peerId: r.peerId,
      seat: r.seat,
      state: r.state,
    }))
  }

  close(): void {
    for (const r of this.peers.values()) r.link.close()
    this.peers.clear()
    this.signaling.close()
  }
}
