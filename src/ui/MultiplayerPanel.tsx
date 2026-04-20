import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoom, joinRoom } from '../net/api'
import { isMultiplayerConfigured } from '../net/config'
import { RoomClient } from '../net/client'
import { RoomHost, type HostedPeer } from '../net/host'
import { isRoomCode } from '../net/protocol'
import type { PeerState } from '../net/peer'
import type { SignalingState } from '../net/signaling'

export interface MultiplayerPanelProps {
  gameId: string
  /** Max remote clients this host is willing to accept. */
  maxClients: number
  /** Called when a hosted room becomes active; useful for the parent to wire snapshots. */
  onHostStarted?: (host: RoomHost) => void
  /** Called when this browser successfully joins a remote host. */
  onClientStarted?: (client: RoomClient) => void
  onClosed?: () => void
}

type Mode = 'idle' | 'hosting' | 'client'

export function MultiplayerPanel({
  gameId,
  maxClients,
  onHostStarted,
  onClientStarted,
  onClosed,
}: MultiplayerPanelProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const [roomCode, setRoomCode] = useState<string>('')
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [status, setStatus] = useState<string>('')
  const [signalingState, setSignalingState] = useState<SignalingState>('closed')
  const [peerState, setPeerState] = useState<PeerState>('new')
  const [roster, setRoster] = useState<HostedPeer[]>([])
  const [error, setError] = useState<string>('')
  const hostRef = useRef<RoomHost | null>(null)
  const clientRef = useRef<RoomClient | null>(null)

  const configured = isMultiplayerConfigured()

  const teardown = useCallback(() => {
    hostRef.current?.close()
    hostRef.current = null
    clientRef.current?.close()
    clientRef.current = null
    setMode('idle')
    setRoomCode('')
    setRoster([])
    setSignalingState('closed')
    setPeerState('new')
    setStatus('')
    onClosed?.()
  }, [onClosed])

  useEffect(() => () => teardown(), [teardown])

  const startHost = useCallback(async () => {
    setError('')
    setStatus('Creating room…')
    try {
      const { roomCode: code, hostPeerId, token, wsUrl } = await createRoom({
        gameId,
        maxClients,
      })
      const host = new RoomHost({
        wsUrl,
        roomCode: code,
        hostPeerId,
        token,
        onSignalingState: setSignalingState,
        onRosterChange: setRoster,
        onIntent: () => {
          // Intents are consumed by the parent via onHostStarted wiring.
        },
      })
      hostRef.current = host
      setRoomCode(code)
      setMode('hosting')
      setStatus('Share the room code with your friends.')
      onHostStarted?.(host)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('')
    }
  }, [gameId, maxClients, onHostStarted])

  const startClient = useCallback(async () => {
    setError('')
    const code = joinCodeInput.trim().toUpperCase()
    if (!isRoomCode(code)) {
      setError('Room codes are 6 characters (A–Z, 2–9).')
      return
    }
    setStatus('Joining room…')
    try {
      const { roomCode: rc, hostPeerId, clientPeerId, token, wsUrl } = await joinRoom({
        roomCode: code,
      })
      const client = new RoomClient({
        wsUrl,
        roomCode: rc,
        hostPeerId,
        clientPeerId,
        token,
        onSignalingState: setSignalingState,
        onPeerState: setPeerState,
        onStatus: (m) => setStatus(m),
      })
      clientRef.current = client
      setRoomCode(rc)
      setMode('client')
      setStatus('Connecting to host…')
      onClientStarted?.(client)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('')
    }
  }, [joinCodeInput, onClientStarted])

  if (!configured) {
    return (
      <section className="multiplayerPanel multiplayerPanel--disabled" aria-label="Multiplayer">
        <h3>Online play</h3>
        <p>
          Multiplayer is not configured for this build. Set <code>VITE_MULTIPLAYER_HTTP_URL</code>{' '}
          and <code>VITE_MULTIPLAYER_WS_URL</code> at build time to enable it.
        </p>
      </section>
    )
  }

  return (
    <section className="multiplayerPanel" aria-label="Multiplayer">
      <h3>Online play</h3>

      {mode === 'idle' && (
        <div className="multiplayerPanel__controls">
          <button type="button" onClick={startHost}>
            Host game
          </button>
          <form
            className="multiplayerPanel__join"
            onSubmit={(e) => {
              e.preventDefault()
              void startClient()
            }}
          >
            <label htmlFor="mp-join-code">Join with code</label>
            <input
              id="mp-join-code"
              type="text"
              inputMode="text"
              autoComplete="off"
              maxLength={6}
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              placeholder="ABC234"
            />
            <button type="submit">Join</button>
          </form>
        </div>
      )}

      {mode === 'hosting' && (
        <div className="multiplayerPanel__hosting">
          <p>
            Room code: <strong className="multiplayerPanel__code">{roomCode}</strong>
          </p>
          <p>
            Signaling: <em>{signalingState}</em>
          </p>
          <ConnectedPeers roster={roster} />
          <button type="button" onClick={teardown}>
            Close room
          </button>
        </div>
      )}

      {mode === 'client' && (
        <div className="multiplayerPanel__client">
          <p>
            Room code: <strong className="multiplayerPanel__code">{roomCode}</strong>
          </p>
          <p>
            Signaling: <em>{signalingState}</em> · Peer: <em>{peerState}</em>
          </p>
          <button type="button" onClick={teardown}>
            Leave room
          </button>
        </div>
      )}

      {status && <p className="multiplayerPanel__status">{status}</p>}
      {error && (
        <p className="multiplayerPanel__error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function ConnectedPeers({ roster }: { roster: HostedPeer[] }) {
  if (roster.length === 0) {
    return <p className="multiplayerPanel__empty">No clients connected yet.</p>
  }
  return (
    <ul className="multiplayerPanel__roster">
      {roster.map((p) => (
        <li key={p.peerId}>
          Seat {p.seat} — <code>{p.peerId.slice(0, 8)}</code> — {p.state}
        </li>
      ))}
    </ul>
  )
}
