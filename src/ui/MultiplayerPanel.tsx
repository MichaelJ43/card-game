import { useCallback, useEffect, useRef, useState } from 'react'
import { abandonIdleRoom, createRoom, getTurnStatus, joinRoom, startTurnServer, turnHeartbeat } from '../net/api'
import { isMultiplayerConfigured } from '../net/config'
import { RoomClient } from '../net/client'
import { RoomHost, type HostedPeer } from '../net/host'
import {
  isRoomCode,
  type PeerClientChatSend,
  type PeerClientIntent,
  type PeerClientSetDisplayName,
  type PeerHostChatLine,
  type PeerHostSnapshot,
} from '../net/protocol'
import type { PeerState } from '../net/peer'
import type { SignalingState } from '../net/signaling'
import { MultiplayerIdleModal } from './MultiplayerIdleModal'

export interface MultiplayerNameplateProps {
  seat: number
  playerId: string
  initialName: string
  disabled?: boolean
  onCommit: (raw: string) => void
}

export interface MultiplayerPanelProps {
  gameId: string
  /** Max remote clients this host is willing to accept. */
  maxClients: number
  /** Host has an active table — keep RoomHost mounted; show compact room UI. */
  tableActive?: boolean
  /** Called when a hosted room becomes active; useful for the parent to wire snapshots. */
  onHostStarted?: (host: RoomHost) => void
  /** Called when this browser successfully joins a remote host. */
  onClientStarted?: (client: RoomClient) => void
  /** Host state received over the data channel (viewer). */
  onSessionSnapshot?: (snap: PeerHostSnapshot) => void
  /** Client → host game intents (host only). */
  onRemoteIntent?: (intent: PeerClientIntent, fromPeerId: string) => void
  /** Client → host display name updates (host only). */
  onRemoteSetDisplayName?: (msg: PeerClientSetDisplayName, fromPeerId: string) => void
  /** Client → host room chat (host only). */
  onRemoteChatSend?: (msg: PeerClientChatSend, fromPeerId: string) => void
  /** Host → client chat line (client only). */
  onRoomChatLine?: (line: PeerHostChatLine) => void
  /** Open second-window room chat (host or joined client). */
  onOpenChat?: () => void
  /** When false, **Open chat** is disabled (e.g. spectating). */
  chatEnabled?: boolean
  /** Tooltip when **Open chat** is disabled; defaults to a generic message. */
  chatDisabledTitle?: string
  /** Shown after a blocked popup when opening chat. */
  chatOpenFailed?: string
  /** Host roster changed (e.g. client connected); parent may push a table snapshot. */
  onHostingRosterChange?: (peers: HostedPeer[]) => void
  /** Any multiplayer teardown (Close room, Leave room, or host disconnect). */
  onTeardown?: (wasHost: boolean) => void
  onClosed?: () => void
  /** Host acks from the peer channel (e.g. failed rename). */
  onPeerAck?: (nonce: string, ok: boolean, error: string | undefined) => void
  /** Local viewer’s seat label editor (when the table has a seat roster). */
  nameplate?: MultiplayerNameplateProps
}

type Mode = 'idle' | 'hosting' | 'client'

const IDLE_WARN_MS = 60 * 60 * 1000
const IDLE_COUNTDOWN_SEC = 5 * 60

export function MultiplayerPanel({
  gameId,
  maxClients,
  tableActive = false,
  onHostStarted,
  onClientStarted,
  onSessionSnapshot,
  onRemoteIntent,
  onRemoteSetDisplayName,
  onRemoteChatSend,
  onRoomChatLine,
  onOpenChat,
  chatEnabled = true,
  chatDisabledTitle,
  chatOpenFailed,
  onHostingRosterChange,
  onTeardown,
  onClosed,
  onPeerAck,
  nameplate,
}: MultiplayerPanelProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const [roomCode, setRoomCode] = useState<string>('')
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [status, setStatus] = useState<string>('')
  const [signalingState, setSignalingState] = useState<SignalingState>('closed')
  const [peerState, setPeerState] = useState<PeerState>('new')
  const [roster, setRoster] = useState<HostedPeer[]>([])
  const [error, setError] = useState<string>('')
  const [idleModalOpen, setIdleModalOpen] = useState(false)
  const [idleSecondsLeft, setIdleSecondsLeft] = useState(IDLE_COUNTDOWN_SEC)
  const [turnControlAvailable, setTurnControlAvailable] = useState(false)
  const [turnReady, setTurnReady] = useState(false)
  const [turnStarting, setTurnStarting] = useState(false)
  const hostRef = useRef<RoomHost | null>(null)
  const clientRef = useRef<RoomClient | null>(null)
  const hostJwtRef = useRef<string | null>(null)
  const clientJwtRef = useRef<string | null>(null)
  const lastShellActivityRef = useRef(0)

  const configured = isMultiplayerConfigured()

  const updatePeerStatus = useCallback((s: PeerState) => {
    setPeerState(s)
    if (s === 'open') setStatus('Connected to host.')
    else if (s === 'connecting') setStatus('Connecting to host…')
    else if (s === 'closed') setStatus('Disconnected from host.')
  }, [])

  const teardown = useCallback((opts?: { clientKickedByHost?: boolean; idleTimeout?: boolean }) => {
    const wasHost = hostRef.current !== null
    hostRef.current?.close()
    hostRef.current = null
    clientRef.current?.close()
    clientRef.current = null
    hostJwtRef.current = null
    clientJwtRef.current = null
    setMode('idle')
    setRoomCode('')
    setRoster([])
    setSignalingState('closed')
    setPeerState('new')
    setIdleModalOpen(false)
    setIdleSecondsLeft(IDLE_COUNTDOWN_SEC)
    setStatus(
      opts?.idleTimeout
        ? 'Session ended after inactivity.'
        : opts?.clientKickedByHost
          ? 'Host closed the room or disconnected.'
          : '',
    )
    setError('')
    lastShellActivityRef.current = 0
    onTeardown?.(wasHost)
    onClosed?.()
  }, [onClosed, onTeardown])

  useEffect(() => () => teardown(), [teardown])

  useEffect(() => {
    if (mode === 'idle') return
    if (lastShellActivityRef.current === 0) {
      lastShellActivityRef.current = Date.now()
    }
  }, [mode])

  const touchShellActivity = useCallback(() => {
    lastShellActivityRef.current = Date.now()
    if (idleModalOpen) {
      setIdleModalOpen(false)
      setIdleSecondsLeft(IDLE_COUNTDOWN_SEC)
    }
  }, [idleModalOpen])

  useEffect(() => {
    if (mode === 'idle') return
    const onAct = () => touchShellActivity()
    window.addEventListener('pointerdown', onAct, true)
    window.addEventListener('keydown', onAct, true)
    return () => {
      window.removeEventListener('pointerdown', onAct, true)
      window.removeEventListener('keydown', onAct, true)
    }
  }, [mode, touchShellActivity])

  useEffect(() => {
    if (mode === 'idle' || idleModalOpen) return
    const t = window.setInterval(() => {
      if (Date.now() - lastShellActivityRef.current >= IDLE_WARN_MS) {
        setIdleModalOpen(true)
        setIdleSecondsLeft(IDLE_COUNTDOWN_SEC)
      }
    }, 15_000)
    return () => window.clearInterval(t)
  }, [mode, idleModalOpen])

  const onIdleExpire = useCallback(async () => {
    setIdleModalOpen(false)
    const token = hostJwtRef.current
    if (hostRef.current && token) {
      try {
        await abandonIdleRoom({ token })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
    teardown({ idleTimeout: true })
  }, [teardown])

  const wakeTurnServer = useCallback(async () => {
    setTurnStarting(true)
    setError('')
    try {
      await startTurnServer()
      const st = await getTurnStatus()
      setTurnReady(Boolean(st.ready))
      setStatus(st.message ? String(st.message) : 'Relay server is starting — try again in a minute if needed.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setTurnStarting(false)
    }
  }, [])

  useEffect(() => {
    if (!idleModalOpen) return
    setIdleSecondsLeft(IDLE_COUNTDOWN_SEC)
    let s = IDLE_COUNTDOWN_SEC
    const id = window.setInterval(() => {
      s -= 1
      setIdleSecondsLeft(s)
      if (s <= 0) {
        window.clearInterval(id)
        void onIdleExpire()
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [idleModalOpen, onIdleExpire])

  useEffect(() => {
    if (mode !== 'hosting' && mode !== 'client') return
    const tick = () => {
      const token = mode === 'hosting' ? hostJwtRef.current : clientJwtRef.current
      if (!token) return
      void turnHeartbeat({ token }).catch(() => {})
    }
    tick()
    const t = window.setInterval(tick, 60_000)
    return () => window.clearInterval(t)
  }, [mode])

  useEffect(() => {
    if (mode !== 'hosting') return
    const poll = async () => {
      try {
        const st = await getTurnStatus()
        if (!st.enabled) {
          setTurnControlAvailable(false)
          return
        }
        setTurnControlAvailable(true)
        setTurnReady(Boolean(st.ready))
      } catch {
        setTurnControlAvailable(false)
      }
    }
    void poll()
    const t = window.setInterval(poll, 20_000)
    return () => window.clearInterval(t)
  }, [mode])

  const startHost = useCallback(async () => {
    setError('')
    setStatus('Creating room…')
    try {
      const { roomCode: code, hostPeerId, token, wsUrl } = await createRoom({
        gameId,
        maxClients,
      })
      hostJwtRef.current = token
      lastShellActivityRef.current = Date.now()
      const host = new RoomHost({
        wsUrl,
        roomCode: code,
        hostPeerId,
        token,
        onSignalingState: setSignalingState,
        onRoomClosing: () => {
          teardown({ idleTimeout: true })
        },
        onRosterChange: (peers) => {
          setRoster(peers)
          onHostingRosterChange?.(peers)
        },
        onIntent: (msg, from) => {
          if (msg.type === 'intent') onRemoteIntent?.(msg, from)
          else if (msg.type === 'setDisplayName') onRemoteSetDisplayName?.(msg, from)
          else if (msg.type === 'chatSend') onRemoteChatSend?.(msg, from)
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
  }, [
    gameId,
    maxClients,
    onHostStarted,
    onHostingRosterChange,
    onRemoteIntent,
    onRemoteSetDisplayName,
    onRemoteChatSend,
    teardown,
  ])

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
      clientJwtRef.current = token
      lastShellActivityRef.current = Date.now()
      const client = new RoomClient({
        wsUrl,
        roomCode: rc,
        hostPeerId,
        clientPeerId,
        token,
        onSignalingState: setSignalingState,
        onPeerState: updatePeerStatus,
        onSnapshot: (snap) => onSessionSnapshot?.(snap),
        onStatus: (m) => setStatus(m),
        onAck: (nonce, ok, err) => onPeerAck?.(nonce, ok, err),
        onChatLine: (line) => onRoomChatLine?.(line),
        onHostEnded: () => {
          teardown({ clientKickedByHost: true })
        },
        onRoomClosing: () => {
          teardown({ idleTimeout: true })
        },
      })
      clientRef.current = client
      setRoomCode(rc)
      setMode('client')
      onClientStarted?.(client)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('')
    }
  }, [joinCodeInput, onClientStarted, onPeerAck, onRoomChatLine, onSessionSnapshot, teardown, updatePeerStatus])

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

  const showCompact = tableActive && mode !== 'idle'
  const showOpenChat = mode !== 'idle' && !!onOpenChat
  const chatDisabledHint = chatDisabledTitle ?? 'Chat is not available.'

  return (
    <section className="multiplayerPanel" aria-label="Multiplayer">
      <h3>Online play</h3>

      {!showCompact && mode === 'idle' && (
        <div className="multiplayerPanel__controls">
          <button type="button" className="app__btnSecondary app__btnToolbar" onClick={startHost}>
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
            <button type="submit" className="app__btnSecondary app__btnToolbar">
              Join
            </button>
          </form>
        </div>
      )}

      {showCompact && mode === 'hosting' && (
        <div className="multiplayerPanel__compact multiplayerPanel__compact--stacked">
          <div className="multiplayerPanel__compactRow multiplayerPanel__compactRow--split">
            <span className="multiplayerPanel__compactLead">
              Hosting · code <strong className="multiplayerPanel__code">{roomCode}</strong>
            </span>
            <div className="multiplayerPanel__compactTail">
              {nameplate && (
                <NameplateInline
                  seat={nameplate.seat}
                  playerId={nameplate.playerId}
                  initialName={nameplate.initialName}
                  disabled={nameplate.disabled}
                  onCommit={nameplate.onCommit}
                />
              )}
              {showOpenChat && (
                <button
                  type="button"
                  className="app__btnSecondary app__btnToolbar"
                  disabled={!chatEnabled}
                  title={!chatEnabled ? chatDisabledHint : undefined}
                  onClick={() => onOpenChat?.()}
                >
                  Open chat
                </button>
              )}
              {turnControlAvailable && (
                <button
                  type="button"
                  className={`app__btnSecondary app__btnToolbar multiplayerPanel__turnBtn${turnReady ? ' multiplayerPanel__turnBtn--ready' : ' multiplayerPanel__turnBtn--off'}`}
                  disabled={turnReady || turnStarting}
                  title={
                    turnReady
                      ? 'Relay server is ready.'
                      : 'Start the optional TURN relay VM (may take 1–3 minutes).'
                  }
                  onClick={() => void wakeTurnServer()}
                >
                  {turnReady ? 'Relay ready' : turnStarting ? 'Starting relay…' : 'Start relay'}
                </button>
              )}
              <button type="button" className="app__btnSecondary app__btnToolbar" onClick={() => teardown()}>
                Close room
              </button>
            </div>
          </div>
          {roster.length > 0 ? (
            <ul className="multiplayerPanel__compactRoster" aria-label="Connected clients">
              {roster.map((p) => (
                <li key={p.peerId}>
                  Seat {p.seat} — <code>{p.peerId.slice(0, 8)}</code> — {p.state}
                </li>
              ))}
            </ul>
          ) : (
            <p className="multiplayerPanel__compactRoster multiplayerPanel__compactRoster--empty">No clients connected.</p>
          )}
        </div>
      )}

      {showCompact && mode === 'client' && (
        <div className="multiplayerPanel__compact">
          <div className="multiplayerPanel__compactRow multiplayerPanel__compactRow--split">
            <span className="multiplayerPanel__compactLead">
              Joined · code <strong className="multiplayerPanel__code">{roomCode}</strong> · signaling{' '}
              <em>{signalingState}</em> · peer <em>{peerState}</em>
            </span>
            <div className="multiplayerPanel__compactTail">
              {nameplate && (
                <NameplateInline
                  seat={nameplate.seat}
                  playerId={nameplate.playerId}
                  initialName={nameplate.initialName}
                  disabled={nameplate.disabled}
                  onCommit={nameplate.onCommit}
                />
              )}
              {showOpenChat && (
                <button
                  type="button"
                  className="app__btnSecondary app__btnToolbar"
                  disabled={!chatEnabled}
                  title={!chatEnabled ? chatDisabledHint : undefined}
                  onClick={() => onOpenChat?.()}
                >
                  Open chat
                </button>
              )}
              <button type="button" className="app__btnSecondary app__btnToolbar" onClick={() => teardown()}>
                Leave room
              </button>
            </div>
          </div>
        </div>
      )}

      {!showCompact && mode === 'hosting' && (
        <div className="multiplayerPanel__hosting">
          <p>
            Room code: <strong className="multiplayerPanel__code">{roomCode}</strong>
          </p>
          <p>
            Signaling: <em>{signalingState}</em>
          </p>
          <ConnectedPeers roster={roster} />
          <div className="multiplayerPanel__hostingActions">
            {showOpenChat && (
              <button
                type="button"
                className="app__btnSecondary app__btnToolbar"
                disabled={!chatEnabled}
                title={!chatEnabled ? chatDisabledHint : undefined}
                onClick={() => onOpenChat?.()}
              >
                Open chat
              </button>
            )}
            {turnControlAvailable && (
              <button
                type="button"
                className={`app__btnSecondary app__btnToolbar multiplayerPanel__turnBtn${turnReady ? ' multiplayerPanel__turnBtn--ready' : ' multiplayerPanel__turnBtn--off'}`}
                disabled={turnReady || turnStarting}
                title={
                  turnReady
                    ? 'Relay server is ready.'
                    : 'Start the optional TURN relay VM (may take 1–3 minutes).'
                }
                onClick={() => void wakeTurnServer()}
              >
                {turnReady ? 'Relay ready' : turnStarting ? 'Starting relay…' : 'Start relay'}
              </button>
            )}
            <button type="button" className="app__btnSecondary app__btnToolbar" onClick={() => teardown()}>
              Close room
            </button>
          </div>
        </div>
      )}

      {!showCompact && mode === 'client' && (
        <div className="multiplayerPanel__client">
          <p>
            Room code: <strong className="multiplayerPanel__code">{roomCode}</strong>
          </p>
          <p>
            Signaling: <em>{signalingState}</em> · Peer: <em>{peerState}</em>
          </p>
          <div className="multiplayerPanel__hostingActions">
            {showOpenChat && (
              <button
                type="button"
                className="app__btnSecondary app__btnToolbar"
                disabled={!chatEnabled}
                title={!chatEnabled ? chatDisabledHint : undefined}
                onClick={() => onOpenChat?.()}
              >
                Open chat
              </button>
            )}
            <button type="button" className="app__btnSecondary app__btnToolbar" onClick={() => teardown()}>
              Leave room
            </button>
          </div>
        </div>
      )}

      {status && <p className="multiplayerPanel__status">{status}</p>}
      {error && (
        <p className="multiplayerPanel__error" role="alert">
          {error}
        </p>
      )}
      {chatOpenFailed ? <p className="multiplayerPanel__chatFail">{chatOpenFailed}</p> : null}

      <MultiplayerIdleModal
        open={idleModalOpen}
        secondsRemaining={idleSecondsLeft}
        onDismiss={() => {
          touchShellActivity()
        }}
      />
    </section>
  )
}

const NAMEPLATE_HINT = 'Shown on the table and score card. Does not change your seat.'

function NameplateInline({
  seat,
  playerId,
  initialName,
  disabled,
  onCommit,
}: Pick<MultiplayerNameplateProps, 'seat' | 'playerId' | 'initialName' | 'disabled' | 'onCommit'>) {
  const [draft, setDraft] = useState(initialName)
  useEffect(() => {
    setDraft(initialName)
  }, [playerId, initialName])
  if (!playerId) return null
  const inputId = `mp-display-name-${seat}`
  return (
    <div className="multiplayerPanel__nameplateInline" title={NAMEPLATE_HINT}>
      <label className="multiplayerPanel__nameplateInlineShort" htmlFor={inputId}>
        Name
      </label>
      <input
        id={inputId}
        className="multiplayerPanel__nameplateInlineInput"
        type="text"
        maxLength={40}
        autoComplete="nickname"
        value={draft}
        disabled={disabled}
        aria-label={`Table display name, seat ${seat}`}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button
        type="button"
        className="app__btnSecondary app__btnToolbar"
        disabled={disabled || !draft.trim()}
        title={NAMEPLATE_HINT}
        onClick={() => onCommit(draft)}
      >
        Save
      </button>
    </div>
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
