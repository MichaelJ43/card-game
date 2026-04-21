import { getMultiplayerConfig } from './config'
import { isPeerMessage, type PeerMessage } from './protocol'

export type PeerState = 'new' | 'connecting' | 'open' | 'closed'

export interface PeerLinkOptions {
  /** Opaque id for logs / roster. */
  remotePeerId: string
  /** Called with low-level signaling (SDP/ICE) that must be relayed via the server. */
  onSignal: (payload: unknown) => void
  onPeerMessage: (message: PeerMessage) => void
  onStateChange?: (state: PeerState) => void
  /** When true, this side creates the data channel (offerer). */
  initiator: boolean
  channelLabel?: string
}

/**
 * Thin wrapper around RTCPeerConnection + a single DataChannel for game traffic.
 * Higher layers ({@link RoomHost}, {@link RoomClient}) feed remote signaling here
 * through {@link PeerLink.acceptSignal}.
 */
export class PeerLink {
  private pc: RTCPeerConnection
  private channel: RTCDataChannel | null = null
  private pendingCandidates: RTCIceCandidateInit[] = []
  private remoteDescSet = false
  private state: PeerState = 'new'
  private readonly opts: PeerLinkOptions

  constructor(opts: PeerLinkOptions) {
    this.opts = opts
    const { iceServers } = getMultiplayerConfig()
    this.pc = new RTCPeerConnection({ iceServers })

    this.pc.addEventListener('icecandidate', (ev) => {
      if (ev.candidate) {
        this.opts.onSignal({ kind: 'ice', candidate: ev.candidate.toJSON() })
      }
    })
    this.pc.addEventListener('connectionstatechange', () => {
      const s = this.pc.connectionState
      if (s === 'connected') this.setState('open')
      else if (s === 'connecting' || s === 'new') this.setState('connecting')
      else if (s === 'closed' || s === 'failed' || s === 'disconnected') this.setState('closed')
    })

    if (opts.initiator) {
      const ch = this.pc.createDataChannel(opts.channelLabel ?? 'game', { ordered: true })
      this.attachChannel(ch)
      void this.createOffer()
    } else {
      this.pc.addEventListener('datachannel', (ev) => {
        this.attachChannel(ev.channel)
      })
    }
  }

  private setState(next: PeerState) {
    if (this.state === next) return
    this.state = next
    this.opts.onStateChange?.(next)
  }

  getState(): PeerState {
    return this.state
  }

  private attachChannel(ch: RTCDataChannel) {
    this.channel = ch
    ch.addEventListener('open', () => this.setState('open'))
    ch.addEventListener('close', () => this.setState('closed'))
    ch.addEventListener('message', (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data))
        if (isPeerMessage(parsed)) {
          this.opts.onPeerMessage(parsed)
        }
      } catch {
        // ignore
      }
    })
  }

  private async createOffer() {
    this.setState('connecting')
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    this.opts.onSignal({ kind: 'sdp', sdp: offer })
  }

  /** Process an incoming envelope relayed by the signaling server. */
  async acceptSignal(payload: unknown): Promise<void> {
    if (!payload || typeof payload !== 'object') return
    const kind = (payload as { kind?: string }).kind
    if (kind === 'sdp') {
      const sdp = (payload as { sdp?: RTCSessionDescriptionInit }).sdp
      if (!sdp) return
      await this.pc.setRemoteDescription(sdp)
      this.remoteDescSet = true
      for (const c of this.pendingCandidates) {
        await this.pc.addIceCandidate(c).catch(() => {})
      }
      this.pendingCandidates = []
      if (sdp.type === 'offer') {
        const answer = await this.pc.createAnswer()
        await this.pc.setLocalDescription(answer)
        this.opts.onSignal({ kind: 'sdp', sdp: answer })
      }
    } else if (kind === 'ice') {
      const candidate = (payload as { candidate?: RTCIceCandidateInit }).candidate
      if (!candidate) return
      if (!this.remoteDescSet) {
        this.pendingCandidates.push(candidate)
      } else {
        await this.pc.addIceCandidate(candidate).catch(() => {})
      }
    }
  }

  send(msg: PeerMessage) {
    const json = JSON.stringify(msg)
    if (this.channel && this.channel.readyState === 'open') {
      this.channel.send(json)
    }
  }

  close() {
    try {
      this.channel?.close()
    } catch {
      // ignore
    }
    try {
      this.pc.close()
    } catch {
      // ignore
    }
    this.setState('closed')
  }
}
