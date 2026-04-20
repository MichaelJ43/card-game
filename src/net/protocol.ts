/**
 * Wire protocol for multiplayer. Everything is JSON over two transports:
 *  - Signaling (WebSocket to API Gateway + Lambda): {@link SignalingMessage}
 *  - Peer-to-peer game channel (WebRTC DataChannel): {@link PeerMessage}
 *
 * Host-authoritative: the host runs the game module locally and broadcasts
 * state snapshots; clients send {@link PeerClientIntent} and render what the
 * host sends back. Incrementing {@link PROTOCOL_VERSION} is a breaking change.
 */

export const PROTOCOL_VERSION = 1

/** Room codes are 6 uppercase alphanumeric chars, ambiguous glyphs dropped. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6

export function isRoomCode(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    s.length === ROOM_CODE_LENGTH &&
    [...s].every((c) => ROOM_CODE_ALPHABET.includes(c))
  )
}

export function generateRoomCode(rng: () => number = Math.random): string {
  let out = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)]
  }
  return out
}

// ---------- Signaling (browser <-> API Gateway WebSocket) ----------

export type SignalingRole = 'host' | 'client'

export interface SignalingHello {
  type: 'hello'
  version: number
  role: SignalingRole
  roomCode: string
  /** Short-lived JWT issued by the HTTP room API. */
  token: string
  /** Stable id assigned by the backend; used for reconnection. */
  peerId: string
}

export interface SignalingWelcome {
  type: 'welcome'
  roomCode: string
  /** Host peerId (for clients); clients send ICE/SDP offers/answers targeted here. */
  hostPeerId: string
  /** For the host only: current list of connected client peer ids. */
  clientPeerIds?: string[]
}

export interface SignalingRelay {
  type: 'relay'
  /** Intended recipient peerId. */
  to: string
  /** Must match the sender’s authenticated peerId. */
  from: string
  /** Opaque envelope; typically WebRTC SDP or ICE candidate JSON. */
  payload: unknown
}

export interface SignalingPeerJoined {
  type: 'peer-joined'
  peerId: string
}

export interface SignalingPeerLeft {
  type: 'peer-left'
  peerId: string
}

export interface SignalingError {
  type: 'error'
  code:
    | 'bad-token'
    | 'bad-room'
    | 'room-full'
    | 'not-host'
    | 'protocol-mismatch'
    | 'rate-limited'
    | 'unknown'
  message: string
}

export type SignalingMessage =
  | SignalingHello
  | SignalingWelcome
  | SignalingRelay
  | SignalingPeerJoined
  | SignalingPeerLeft
  | SignalingError

// ---------- Peer-to-peer (WebRTC DataChannel) ----------

/** Host → client: authoritative state snapshot or delta notification. */
export interface PeerHostSnapshot {
  type: 'snapshot'
  /** Monotonically increasing version; clients discard out-of-order snapshots. */
  rev: number
  /**
   * Opaque payload encoding the current shared view.
   * v1 simply sends the full `{ table, gameState, match }` JSON.
   */
  state: unknown
  /** Seat index this receiver controls (0 = host). */
  seat: number
}

/** Host → client: action was accepted/rejected. */
export interface PeerHostAck {
  type: 'ack'
  /** Correlates to {@link PeerClientIntent.nonce}. */
  nonce: string
  ok: boolean
  error?: string
}

/** Host → client: compact status / chat line for UI. */
export interface PeerHostStatus {
  type: 'status'
  message: string
}

/** Client → host: proposed game action. */
export interface PeerClientIntent {
  type: 'intent'
  /** Correlates to {@link PeerHostAck.nonce}. */
  nonce: string
  /** Seat index the sender claims to be (host validates against its roster). */
  seat: number
  /** A {@link GameAction} serialized as JSON. */
  action: unknown
}

/** Client → host: liveness ping to detect silent disconnects. */
export interface PeerClientPing {
  type: 'ping'
  t: number
}

export interface PeerHostPong {
  type: 'pong'
  t: number
}

export type PeerMessage =
  | PeerHostSnapshot
  | PeerHostAck
  | PeerHostStatus
  | PeerClientIntent
  | PeerClientPing
  | PeerHostPong

// ---------- Runtime validation ----------

export function isSignalingMessage(value: unknown): value is SignalingMessage {
  if (!value || typeof value !== 'object') return false
  const t = (value as { type?: unknown }).type
  return (
    t === 'hello' ||
    t === 'welcome' ||
    t === 'relay' ||
    t === 'peer-joined' ||
    t === 'peer-left' ||
    t === 'error'
  )
}

export function isPeerMessage(value: unknown): value is PeerMessage {
  if (!value || typeof value !== 'object') return false
  const t = (value as { type?: unknown }).type
  return (
    t === 'snapshot' ||
    t === 'ack' ||
    t === 'status' ||
    t === 'intent' ||
    t === 'ping' ||
    t === 'pong'
  )
}
