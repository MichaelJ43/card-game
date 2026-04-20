import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { AI_DIFFICULTY_OPTIONS, normalizeAiDifficulty, type AiDifficulty } from './core/aiContext'
import { type MatchState } from './core/match'
import { aiPlayerMenuLabel, playerSeatLabel } from './core/playerLabels'
import { parseGameManifestYaml } from './core/loadYaml'
import { createSession, startNextMatchRound, type CreateSessionOptions, type GameSession } from './session'
import { buildDefaultSeatProfiles } from './session/seatProfiles'
import { createSessionOptionsHouseRules } from './data/houseRules'
import { GAME_IDS, GAME_SOURCES } from './data/manifests'
import { rulesTextForGame, type RulesGameId } from './data/rulesSources'
import {
  clampAiOpponentCount,
  gameSupportsConfigurableAi,
  gameSupportsOnlineMultiplayer,
  gameSupportsPerSeatAiDifficulty,
  MAX_AI_OPPONENTS,
  MAX_REMOTE_HUMANS,
  normalizeAiDifficultiesForCount,
} from './session/playerConfig'
import { GameHouseRulesPanel } from './ui/GameHouseRulesPanel'
import type { RoomClient } from './net/client'
import type { HostedPeer, RoomHost } from './net/host'
import {
  sanitizeDisplayName,
  type PeerClientIntent,
  type PeerClientSetDisplayName,
  type PeerHostSnapshot,
} from './net/protocol'
import { parseSessionSnapshot, serializeSessionSnapshot } from './net/sessionSnapshot'
import { MultiplayerPanel } from './ui/MultiplayerPanel'
import { RulesModal } from './ui/RulesModal'
import { TableView, type ActiveTurnHighlight, type TableIntent } from './ui/TableView'
import { skyjoDumpUiStepShouldReset, type SkyjoDumpUiStep } from './ui/tableUiFlow'
import type { GameAction } from './core/types'
import type { GoFishGameState } from './games/go-fish'
import { isSkyjoSlotTemplateId, type SkyjoGameState } from './games/skyjo'
import type { MultiplayerNameplateProps } from './ui/MultiplayerPanel'

function attachHostSeatProfilesIfNeeded(
  sess: GameSession,
  id: (typeof GAME_IDS)[number],
  hosting: boolean,
): GameSession {
  if (!hosting || !gameSupportsOnlineMultiplayer(id)) return sess
  return { ...sess, seatProfiles: buildDefaultSeatProfiles(sess.manifest) }
}

/** Local human’s server seat index (0 = host / solo). */
function shellHumanSeat(session: GameSession | null): number {
  if (!session?.net || session.net.spectator) return 0
  return session.net.seat
}

/** TableView “you” seat; -1 = spectator (no local seat). */
function tableViewHumanIndex(session: GameSession | null): number {
  if (!session?.net) return 0
  if (session.net.spectator) return -1
  return session.net.seat
}

/** First player index that is an AI seat (manifest humans occupy 0..human-1). */
function firstAiSeatIndex(session: GameSession | null): number {
  if (!session) return 1
  return session.manifest.players.human
}

/** Server seat for “You” in score tables; null when spectating (no local seat). */
function localViewerSeat(session: GameSession | null): number | null {
  if (!session?.net) return 0
  if (session.net.spectator) return null
  return session.net.seat
}

function MatchCumulativePanel({
  match,
  toolbar,
  scoreColumnLabel = 'Total',
  caption = 'Cumulative scores',
  scoringMode = 'points',
  pendingRoundScores,
  playerSeatCaption,
}: {
  match: MatchState
  toolbar?: boolean
  scoreColumnLabel?: string
  caption?: string
  scoringMode?: 'points' | 'chips'
  /** Round scored in game state but not yet merged — updates Total column only (no layout change). */
  pendingRoundScores?: number[] | null
  /** Row header for each seat (defaults to {@link playerSeatLabel}). */
  playerSeatCaption?: (playerIndex: number) => string
}) {
  const unit = scoringMode === 'chips' ? 'chips' : 'points'
  const history = match.completedRoundScores ?? []
  const n = match.cumulativeScores.length
  const pending =
    pendingRoundScores && pendingRoundScores.length === n ? pendingRoundScores : null
  const displayTotals = pending
    ? match.cumulativeScores.map((c, i) => c + (pending[i] ?? 0))
    : match.cumulativeScores

  const rowCaption = playerSeatCaption ?? ((pi: number) => playerSeatLabel(pi))

  return (
    <div className={`matchCumulative${toolbar ? ' matchCumulative--toolbar' : ''}`}>
      <div className="matchCumulative__scroll">
        <table
          className="matchCumulative__table"
          title={
            pending
              ? `${scoreColumnLabel} shows the result after merging this round (before you click Next round).`
              : undefined
          }
        >
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="matchCumulative__thPlayer">
                Player
              </th>
              {history.map((_, ri) => (
                <th
                  key={`r-${ri}`}
                  scope="col"
                  className={`matchCumulative__thRound matchCumulative__thRound--${ri % 2 === 0 ? 'a' : 'b'}`}
                >
                  R{ri + 1}
                </th>
              ))}
              <th scope="col" className="matchCumulative__thTotal">
                {scoreColumnLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {match.cumulativeScores.map((_, pi) => (
              <tr key={pi}>
                <th scope="row" className="matchCumulative__playerCell">
                  {rowCaption(pi)}
                </th>
                {history.map((roundVec, ri) => (
                  <td
                    key={`${pi}-${ri}`}
                    className={`matchCumulative__roundCell matchCumulative__roundCell--${ri % 2 === 0 ? 'a' : 'b'}`}
                  >
                    {roundVec[pi] ?? '—'}
                  </td>
                ))}
                <td className="matchCumulative__totalCell">
                  {displayTotals[pi] ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="matchCumulative__meta">
        Round {match.round}
        {' · '}
        Stop when someone reaches ≥{match.config.targetScore} {unit} · {match.config.winnerIs} total wins
        {match.complete && match.matchWinnerIndex !== null && (
          <> — Winner: {rowCaption(match.matchWinnerIndex)}</>
        )}
      </p>
    </div>
  )
}

function isGoFishSession(s: GameSession): s is GameSession<GoFishGameState> {
  return s.manifest.module === 'go-fish'
}

/** Opponent index from `hand:i` or `books:i` (Go Fish ask target). */
function goFishTargetPlayerFromZoneId(zoneId: string): number | null {
  const h = /^hand:(\d+)$/.exec(zoneId)
  if (h) return Number(h[1])
  const b = /^books:(\d+)$/.exec(zoneId)
  if (b) return Number(b[1])
  return null
}

function goFishOpponentIntentZones(playerCount: number): string[] {
  const z: string[] = []
  for (let i = 1; i < playerCount; i++) {
    z.push(`hand:${i}`, `books:${i}`)
  }
  return z
}

function isSkyjoSession(s: GameSession): s is GameSession<SkyjoGameState> {
  return s.manifest.module === 'skyjo'
}

function isCrazyEightsSession(s: GameSession): boolean {
  return s.manifest.module === 'crazy-eights'
}

function isUnoSession(s: GameSession): boolean {
  return s.manifest.module === 'uno'
}

/** Games where the shell runs medium-difficulty table AI on non-human turns. */
const TABLE_AI_MEDIUM_MODULES = new Set([
  'thirty-one',
  'euchre',
  'durak',
  'pinochle',
  'canasta',
  'sequence-race',
])

/** Hand-zone active turn highlight for trick / shedding modules. */
const HAND_TURN_HIGHLIGHT_MODULES = TABLE_AI_MEDIUM_MODULES

function customActionKey(a: GameAction): string {
  if (a.type !== 'custom') return ''
  return JSON.stringify(a.payload)
}

function labelCustomAction(a: GameAction): string {
  if (a.type !== 'custom') return 'Action'
  const p = a.payload as Record<string, unknown>
  const cmd = typeof p.cmd === 'string' ? p.cmd : ''
  switch (cmd) {
    case 'bjBet':
      return `Bet ${p.amount}`
    case 'bjHit':
      return 'Hit'
    case 'bjStand':
      return 'Stand'
    case 'bacBet':
      return `${p.side === 'banker' ? 'Banker' : 'Player'} ${p.amount}`
    case 'p5Ante':
      return 'Pay ante'
    case 'p5Draw':
      return `Replace ${p.count} card(s)`
    case 'hcBet':
      return `Bet ${p.amount}`
    case 'c8Draw':
      return 'Draw'
    case 'c8Play': {
      const suit = p.suit
      const ix = p.index
      if (typeof suit === 'string') return `Play #${ix} · ${suit}`
      return `Play card #${ix}`
    }
    case 'unoDraw':
      return 'Draw'
    case 'unoPass':
      return 'Pass'
    case 'unoPassAfterDraw':
      return 'End turn (keep card)'
    case 'unoPlay': {
      const ix = p.index
      const col = p.color
      const names: Record<string, string> = { r: 'Red', y: 'Yellow', g: 'Green', b: 'Blue' }
      if (typeof col === 'string' && names[col]) return `Wild → ${names[col]} (#${ix})`
      return `Play #${ix}`
    }
    case 't31Knock':
      return 'Knock'
    case 't31DrawStock':
      return `Draw deck · discard hand #${p.discardIndex}`
    case 't31TakeDiscard':
      return `Take discard · discard hand #${p.discardIndex}`
    case 'echPlay':
      return `Play hand #${p.index}`
    case 'dukAttack':
      return `Attack · hand #${p.index}`
    case 'dukDefend':
      return `Defend · hand #${p.index}`
    case 'dukTake':
      return 'Take attack card'
    case 'pncPlay':
      return `Play hand #${p.index}`
    case 'cnsDrawTwo':
      return 'Draw two'
    case 'cnsDiscard':
      return `Discard hand #${p.index}`
    case 'srPlay':
      return `Play hand #${p.handIndex} → pile ${Number(p.pileIndex) + 1}`
    case 'srEndTurn':
      return 'End turn (draw to five)'
    default:
      return cmd || 'Custom'
  }
}

function difficultyForAiPlayer(session: GameSession, playerIndex: number): AiDifficulty {
  const firstAi = session.manifest.players.human
  if (playerIndex < firstAi) return 'medium'
  const cfg = session.aiPlayerConfig?.difficulties
  const ix = playerIndex - firstAi
  return cfg && ix >= 0 && ix < cfg.length ? normalizeAiDifficulty(cfg[ix]) : 'medium'
}

function App() {
  const [gameId, setGameId] = useState<(typeof GAME_IDS)[number]>('war')
  const [aiOpponents, setAiOpponents] = useState(1)
  const [aiDifficulties, setAiDifficulties] = useState<AiDifficulty[]>(['medium'])
  const [session, setSession] = useState<GameSession | null>(null)
  const [joinedAsClient, setJoinedAsClient] = useState(false)

  const roomHostRef = useRef<RoomHost | null>(null)
  const roomClientRef = useRef<RoomClient | null>(null)
  const sessionRef = useRef<GameSession | null>(null)
  const pushSnapshotRef = useRef<() => void>(() => {})

  const [gfAwaitingOpponent, setGfAwaitingOpponent] = useState(false)
  const [gfRank, setGfRank] = useState('A')
  const [skyjoDumpStep, setSkyjoDumpStep] = useState<SkyjoDumpUiStep>('idle')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [hostClientRoster, setHostClientRoster] = useState<HostedPeer[]>([])
  /** True while this browser is an active room host (not ref-driven — avoids reading refs during render). */
  const [multiplayerHostActive, setMultiplayerHostActive] = useState(false)

  const selectedManifest = useMemo(() => parseGameManifestYaml(GAME_SOURCES[gameId]), [gameId])

  const onlineClientShell = joinedAsClient || !!session?.net
  const networkSpectator = !!session?.net?.spectator

  const seatDisplayName = useCallback(
    (serverPlayerIndex: number): string => {
      if (!session) return `Player ${serverPlayerIndex + 1}`
      const profileLabel = session.seatProfiles?.find((s) => s.seat === serverPlayerIndex)?.displayName?.trim()
      if (profileLabel) return profileLabel
      const humanCount = session.manifest.players.human
      if (serverPlayerIndex >= humanCount) {
        return aiPlayerMenuLabel(serverPlayerIndex - humanCount)
      }
      if (session.net && !session.net.spectator) {
        if (serverPlayerIndex === 0) return 'Host'
        return `Player ${serverPlayerIndex + 1}`
      }
      if (!session.net) {
        if (serverPlayerIndex === 0) return 'Host'
        const peer = hostClientRoster.find((r) => r.seat === serverPlayerIndex)
        if (peer) {
          const id = peer.peerId
          return id.length > 16 ? `${id.slice(0, 15)}…` : id
        }
        return `Player ${serverPlayerIndex + 1}`
      }
      if (serverPlayerIndex === 0) return 'Host'
      return `Player ${serverPlayerIndex + 1}`
    },
    [session, hostClientRoster],
  )

  const cumulativeRowCaption = useCallback(
    (pi: number) => {
      const local = localViewerSeat(session)
      if (local !== null && pi === local) return 'You'
      return seatDisplayName(pi)
    },
    [session, seatDisplayName],
  )

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    pushSnapshotRef.current = () => {
      const host = roomHostRef.current
      if (!host) return
      const roster = host.getRoster()
      if (!roster.some((r) => r.state === 'open')) return
      const sess = sessionRef.current
      if (!sess) return
      const base = serializeSessionSnapshot(sess)
      if (!base) return
      const remoteHumans = Math.max(0, sess.manifest.players.human - 1)
      host.broadcastSnapshot((seat) => ({
        ...base,
        viewerSeat: seat,
        spectator: seat > remoteHumans,
      }))
    }
    pushSnapshotRef.current()
  }, [session])

  const makeDealOptions = useCallback(
    (
      skipMatch?: boolean,
      forGameId: (typeof GAME_IDS)[number] = gameId,
      difficultyList?: AiDifficulty[],
    ): CreateSessionOptions | undefined => {
      const house = createSessionOptionsHouseRules(forGameId as RulesGameId)
      if (!gameSupportsConfigurableAi(forGameId)) {
        if (skipMatch) {
          return { skipMatch: true, ...house }
        }
        return Object.keys(house).length ? house : undefined
      }
      const diffs = difficultyList ?? aiDifficulties
      return {
        aiCount: aiOpponents,
        aiDifficulties: normalizeAiDifficultiesForCount(aiOpponents, diffs),
        ...(skipMatch ? { skipMatch: true } : {}),
        ...house,
      }
    },
    [gameId, aiOpponents, aiDifficulties],
  )

  const applyFreshDeal = useCallback(
    (id: (typeof GAME_IDS)[number], options?: CreateSessionOptions) => {
      const baseOpts = options ?? makeDealOptions(undefined, id)
      const openRemotes =
        roomHostRef.current?.getRoster().filter((r) => r.state === 'open').length ?? 0
      const withRemotes =
        openRemotes > 0 && gameSupportsOnlineMultiplayer(id)
          ? { ...baseOpts, remoteHumanCount: openRemotes }
          : baseOpts
      const hosting = !!roomHostRef.current
      const sess = attachHostSeatProfilesIfNeeded(
        createSession(id, Math.random, undefined, withRemotes),
        id,
        hosting,
      )
      setSession(sess)
      setGfAwaitingOpponent(false)
      setGfRank('A')
      setSkyjoDumpStep('idle')
    },
    [makeDealOptions],
  )

  const onGameIdChange = useCallback((id: (typeof GAME_IDS)[number]) => {
    setGameId(id)
    setSession(null)
    setGfAwaitingOpponent(false)
    setGfRank('A')
    setSkyjoDumpStep('idle')
  }, [])

  const startOrNewDeal = useCallback(() => {
    if (onlineClientShell) return
    applyFreshDeal(gameId)
  }, [gameId, applyFreshDeal, onlineClientShell])

  const endGame = useCallback(() => {
    if (networkSpectator) {
      if (!session) return
      if (
        !window.confirm(
          'Hide this table? You stay in the room until you leave; the host can start another deal.',
        )
      ) {
        return
      }
      setSession(null)
      return
    }
    if (onlineClientShell) return
    if (!session) return
    if (
      !window.confirm(
        'End this session? You return to the lobby (game picker, Host / Join when available, then Start deal). Match progress for this hand is abandoned.',
      )
    ) {
      return
    }
    setSession(null)
    setSkyjoDumpStep('idle')
    setGfAwaitingOpponent(false)
    setGfRank('A')
  }, [session, networkSpectator, onlineClientShell])

  const onHostStarted = useCallback((host: RoomHost) => {
    roomHostRef.current = host
    setMultiplayerHostActive(true)
    setHostClientRoster(host.getRoster())
  }, [])

  const onClientStarted = useCallback((client: RoomClient) => {
    roomClientRef.current = client
    setJoinedAsClient(true)
  }, [])

  const onSessionSnapshot = useCallback((snap: PeerHostSnapshot) => {
    const parsed = parseSessionSnapshot(snap.state, snap.seat)
    if (!parsed) return
    setSession(parsed)
    setGameId(parsed.manifest.id as (typeof GAME_IDS)[number])
    if (gameSupportsConfigurableAi(parsed.manifest.id)) {
      setAiOpponents(parsed.manifest.players.ai)
    }
    if (parsed.aiPlayerConfig?.difficulties?.length) {
      setAiDifficulties(parsed.aiPlayerConfig.difficulties)
    }
    setGfAwaitingOpponent(false)
    setGfRank('A')
    setSkyjoDumpStep('idle')
  }, [])

  const onRemoteSetDisplayName = useCallback((msg: PeerClientSetDisplayName, fromPeerId: string) => {
    const host = roomHostRef.current
    if (!host) return
    const roster = host.getRoster()
    const rec = roster.find((r) => r.peerId === fromPeerId)
    if (!rec || rec.seat !== msg.seat) {
      host.ack(fromPeerId, msg.nonce, false, 'Seat mismatch')
      return
    }
    const name = sanitizeDisplayName(msg.displayName)
    if (!name) {
      host.ack(fromPeerId, msg.nonce, false, 'Invalid name')
      return
    }
    const prev = sessionRef.current
    if (!prev?.seatProfiles?.length) {
      host.ack(fromPeerId, msg.nonce, false, 'No seat roster')
      return
    }
    const ix = prev.seatProfiles.findIndex((s) => s.seat === msg.seat && s.id === msg.playerId)
    if (ix < 0) {
      host.ack(fromPeerId, msg.nonce, false, 'Unknown seat id')
      return
    }
    const nextProfiles = prev.seatProfiles.slice()
    nextProfiles[ix] = { ...nextProfiles[ix]!, displayName: name }
    setSession({ ...prev, seatProfiles: nextProfiles })
    host.ack(fromPeerId, msg.nonce, true)
  }, [])

  const onRemoteIntent = useCallback((msg: PeerClientIntent, fromPeerId: string) => {
    const host = roomHostRef.current
    if (!host) return
    const roster = host.getRoster()
    const rec = roster.find((r) => r.peerId === fromPeerId)
    if (!rec || rec.seat !== msg.seat) {
      host.ack(fromPeerId, msg.nonce, false, 'Seat mismatch')
      return
    }
    const prev = sessionRef.current
    if (!prev) {
      host.ack(fromPeerId, msg.nonce, false, 'No active table')
      return
    }
    const action = msg.action as GameAction
    const result = prev.module.applyAction(prev.table, prev.gameState, action)
    if (result.error) {
      host.ack(fromPeerId, msg.nonce, false, result.error)
      return
    }
    host.ack(fromPeerId, msg.nonce, true)
    setSession({
      ...prev,
      table: result.table,
      gameState: result.gameState,
    })
  }, [])

  const onMultiplayerTeardown = useCallback((_wasHost: boolean) => {
    roomHostRef.current = null
    roomClientRef.current = null
    setJoinedAsClient(false)
    setMultiplayerHostActive(false)
    setHostClientRoster([])
    setSession(null)
    setGfAwaitingOpponent(false)
    setGfRank('A')
    setSkyjoDumpStep('idle')
  }, [])

  const onHostingRosterChange = useCallback((peers?: HostedPeer[]) => {
    if (peers) setHostClientRoster(peers)
    pushSnapshotRef.current()
  }, [])

  const onNextMatchRound = useCallback(() => {
    if (!session || session.net) return
    try {
      const next = attachHostSeatProfilesIfNeeded(
        startNextMatchRound(session, gameId),
        gameId,
        !!roomHostRef.current,
      )
      setSession(next)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    }
  }, [session, gameId])

  const commitLocalSeatDisplayName = useCallback((raw: string) => {
    const name = sanitizeDisplayName(raw)
    if (!name) return
    setSession((prev) => {
      if (!prev?.seatProfiles?.length) return prev
      const seat = prev.net?.spectator ? null : prev.net ? prev.net.seat : 0
      if (seat == null) return prev
      const ix = prev.seatProfiles.findIndex((s) => s.seat === seat)
      if (ix < 0) return prev
      const nextProfiles = prev.seatProfiles.slice()
      nextProfiles[ix] = { ...nextProfiles[ix]!, displayName: name }
      return { ...prev, seatProfiles: nextProfiles }
    })
  }, [])

  const sendDisplayNameToHost = useCallback((raw: string) => {
    const name = sanitizeDisplayName(raw)
    if (!name) return
    const prev = sessionRef.current
    const c = roomClientRef.current
    if (!prev?.net || prev.net.spectator || !c) return
    const seat = prev.net.seat
    const profile = prev.seatProfiles?.find((s) => s.seat === seat)
    if (!profile) return
    c.sendSetDisplayName({
      nonce: crypto.randomUUID(),
      seat,
      playerId: profile.id,
      displayName: name,
    })
  }, [])

  const multiplayerNameplate = useMemo((): Omit<MultiplayerNameplateProps, 'onCommit'> | null => {
    if (!session?.seatProfiles?.length || !gameSupportsOnlineMultiplayer(gameId)) return null
    if (session.net?.spectator) return null
    const seat = session.net ? session.net.seat : 0
    const profile = session.seatProfiles.find((s) => s.seat === seat)
    if (!profile) return null
    const hostTable = !session.net && multiplayerHostActive
    const clientTable = !!session.net
    if (!hostTable && !clientTable) return null
    return {
      seat: profile.seat,
      playerId: profile.id,
      initialName: profile.displayName,
      disabled: networkSpectator,
    }
  }, [session, gameId, networkSpectator, multiplayerHostActive])

  const handleNameplateCommit = useCallback(
    (raw: string) => {
      if (sessionRef.current?.net && !sessionRef.current.net.spectator) {
        sendDisplayNameToHost(raw)
      } else {
        commitLocalSeatDisplayName(raw)
      }
    },
    [commitLocalSeatDisplayName, sendDisplayNameToHost],
  )

  const onPeerAck = useCallback((_nonce: string, ok: boolean, error: string | undefined) => {
    if (!ok && error) window.alert(error)
  }, [])

  const dispatchAction = useCallback((action: GameAction) => {
    const prev = sessionRef.current
    if (prev?.net?.spectator) return
    if (prev?.net && !prev.net.spectator) {
      const c = roomClientRef.current
      if (!c) return
      c.sendIntent({
        nonce: crypto.randomUUID(),
        seat: prev.net.seat,
        action,
      })
      return
    }
    setSession((p) => {
      if (!p) return p
      const result = p.module.applyAction(p.table, p.gameState, action)
      if (result.error) {
        window.alert(result.error)
        return p
      }
      return {
        ...p,
        table: result.table,
        gameState: result.gameState,
      }
    })
  }, [])

  const status = useMemo(() => {
    if (!session) return ''
    return session.module.statusText(session.table, session.gameState)
  }, [session])

  const canAdvanceMatch = useMemo(() => {
    if (!session) return false
    const m = session.match
    if (!m?.config || m.complete) return false
    const mod = session.module
    return !!(
      mod.isMatchRoundFinished?.(session.gameState) &&
      mod.extractMatchRoundScores?.(session.gameState)?.length
    )
  }, [session])

  const pendingMergeRoundScores = useMemo(() => {
    if (!session) return null
    const m = session.match
    if (!m?.config || m.complete) return null
    const mod = session.module
    if (!mod.isMatchRoundFinished?.(session.gameState)) return null
    const rs = mod.extractMatchRoundScores?.(session.gameState)
    if (!rs?.length) return null
    return rs
  }, [session])

  const matchPreviewTotals = useMemo(() => {
    if (!session || !pendingMergeRoundScores) return null
    const m = session.match
    if (!m?.config || m.complete) return null
    return m.cumulativeScores.map((c, i) => c + (pendingMergeRoundScores[i] ?? 0))
  }, [session, pendingMergeRoundScores])

  const primaryLabel = gameId === 'demo-custom' ? 'Reveal winner' : 'Play round'

  const onPrimary = useCallback(() => {
    dispatchAction({ type: 'step' })
  }, [dispatchAction])

  const legal = useMemo(() => {
    if (!session) return [] as GameAction[]
    return session.module.getLegalActions(session.table, session.gameState)
  }, [session])

  const legalCustomActions = useMemo(
    () => legal.filter((a): a is Extract<GameAction, { type: 'custom' }> => a.type === 'custom'),
    [legal],
  )

  const hidePlayRoundButton = useMemo(() => {
    if (!session) return false
    const m = session.manifest.module
    return (
      m === 'go-fish' ||
      m === 'skyjo' ||
      m === 'blackjack' ||
      m === 'baccarat' ||
      m === 'poker-draw' ||
      m === 'high-card-duel' ||
      m === 'crazy-eights' ||
      m === 'uno' ||
      m === 'thirty-one' ||
      m === 'euchre' ||
      m === 'durak' ||
      m === 'pinochle' ||
      m === 'canasta' ||
      m === 'sequence-race'
    )
  }, [session])

  const activeTurnHighlight = useMemo((): ActiveTurnHighlight | undefined => {
    if (!session) return undefined
    if (isSkyjoSession(session) && session.gameState.phase !== 'roundOver') {
      return { playerIndex: session.gameState.currentPlayer, zoneIdPrefix: 'grid' }
    }
    if (isGoFishSession(session) && session.gameState.phase === 'playing') {
      return { playerIndex: session.gameState.currentPlayer, zoneIdPrefix: 'hand' }
    }
    if (isCrazyEightsSession(session) && (session.gameState as { phase?: string }).phase === 'play') {
      return {
        playerIndex: (session.gameState as { currentPlayer: number }).currentPlayer,
        zoneIdPrefix: 'hand',
      }
    }
    if (isUnoSession(session) && (session.gameState as { phase?: string }).phase === 'play') {
      return {
        playerIndex: (session.gameState as { currentPlayer: number }).currentPlayer,
        zoneIdPrefix: 'hand',
      }
    }
    if (
      HAND_TURN_HIGHLIGHT_MODULES.has(session.manifest.module) &&
      (session.gameState as { phase?: string }).phase === 'play'
    ) {
      return {
        playerIndex: (session.gameState as { currentPlayer: number }).currentPlayer,
        zoneIdPrefix: 'hand',
      }
    }
    return undefined
  }, [session])

  const humanRanks = useMemo(() => {
    if (!session || !isGoFishSession(session)) return [] as string[]
    const hz = session.table.zones[`hand:${shellHumanSeat(session)}`]?.cards ?? []
    const s = new Set<string>()
    for (const c of hz) {
      const r = session.table.templates[c.templateId]?.rank
      if (typeof r === 'string') s.add(r)
    }
    return [...s].sort()
  }, [session])

  useEffect(() => {
    if (session?.net) return
    if (!session) return
    if (!isGoFishSession(session)) return
    const gs = session.gameState
    if (gs.phase !== 'playing' || gs.currentPlayer < firstAiSeatIndex(session)) return

    const handle = window.setTimeout(() => {
      setSession((prev) => {
        if (!prev || !isGoFishSession(prev)) return prev
        const g = prev.gameState
        if (g.phase !== 'playing' || g.currentPlayer < firstAiSeatIndex(prev)) return prev
        const act = prev.module.selectAiAction(prev.table, prev.gameState, g.currentPlayer, Math.random, {
          difficulty: difficultyForAiPlayer(prev, g.currentPlayer),
        })
        if (!act) return prev
        const r = prev.module.applyAction(prev.table, prev.gameState, act)
        if (r.error) return prev
        return { ...prev, table: r.table, gameState: r.gameState }
      })
    }, 550)

    return () => window.clearTimeout(handle)
  }, [session])

  useEffect(() => {
    if (session?.net) return
    if (!session) return
    if (!isCrazyEightsSession(session)) return
    const gs = session.gameState as { phase?: string; currentPlayer?: number }
    if (
      gs.phase !== 'play' ||
      typeof gs.currentPlayer !== 'number' ||
      gs.currentPlayer < firstAiSeatIndex(session)
    )
      return

    const handle = window.setTimeout(() => {
      setSession((prev) => {
        if (!prev || !isCrazyEightsSession(prev)) return prev
        const g = prev.gameState as { phase?: string; currentPlayer?: number }
        if (
          g.phase !== 'play' ||
          typeof g.currentPlayer !== 'number' ||
          g.currentPlayer < firstAiSeatIndex(prev)
        )
          return prev
        const act = prev.module.selectAiAction(
          prev.table,
          prev.gameState,
          g.currentPlayer!,
          Math.random,
          { difficulty: 'medium' },
        )
        if (!act) return prev
        const r = prev.module.applyAction(prev.table, prev.gameState, act)
        if (r.error) return prev
        return { ...prev, table: r.table, gameState: r.gameState }
      })
    }, 500)

    return () => window.clearTimeout(handle)
  }, [session])

  useEffect(() => {
    if (session?.net) return
    if (!session) return
    if (!isUnoSession(session)) return
    const gs = session.gameState as { phase?: string; currentPlayer?: number }
    if (
      gs.phase !== 'play' ||
      typeof gs.currentPlayer !== 'number' ||
      gs.currentPlayer < firstAiSeatIndex(session)
    )
      return

    const handle = window.setTimeout(() => {
      setSession((prev) => {
        if (!prev || !isUnoSession(prev)) return prev
        const g = prev.gameState as { phase?: string; currentPlayer?: number }
        if (
          g.phase !== 'play' ||
          typeof g.currentPlayer !== 'number' ||
          g.currentPlayer < firstAiSeatIndex(prev)
        )
          return prev
        const act = prev.module.selectAiAction(
          prev.table,
          prev.gameState,
          g.currentPlayer!,
          Math.random,
          { difficulty: 'medium' },
        )
        if (!act) return prev
        const r = prev.module.applyAction(prev.table, prev.gameState, act)
        if (r.error) return prev
        return { ...prev, table: r.table, gameState: r.gameState }
      })
    }, 500)

    return () => window.clearTimeout(handle)
  }, [session])

  useEffect(() => {
    if (session?.net) return
    if (!session) return
    if (!TABLE_AI_MEDIUM_MODULES.has(session.manifest.module)) return
    const gs = session.gameState as { phase?: string; currentPlayer?: number }
    if (
      gs.phase !== 'play' ||
      typeof gs.currentPlayer !== 'number' ||
      gs.currentPlayer < firstAiSeatIndex(session)
    )
      return

    const handle = window.setTimeout(() => {
      setSession((prev) => {
        if (!prev || !TABLE_AI_MEDIUM_MODULES.has(prev.manifest.module)) return prev
        const g = prev.gameState as { phase?: string; currentPlayer?: number }
        if (
          g.phase !== 'play' ||
          typeof g.currentPlayer !== 'number' ||
          g.currentPlayer < firstAiSeatIndex(prev)
        )
          return prev
        const act = prev.module.selectAiAction(
          prev.table,
          prev.gameState,
          g.currentPlayer!,
          Math.random,
          { difficulty: difficultyForAiPlayer(prev, g.currentPlayer!) },
        )
        if (!act) return prev
        const r = prev.module.applyAction(prev.table, prev.gameState, act)
        if (r.error) return prev
        return { ...prev, table: r.table, gameState: r.gameState }
      })
    }, 500)

    return () => window.clearTimeout(handle)
  }, [session])

  useEffect(() => {
    if (session?.net) return
    if (!session) return
    if (!isSkyjoSession(session)) return
    const gs = session.gameState
    if (gs.phase === 'roundOver' || gs.currentPlayer < firstAiSeatIndex(session)) return

    const handle = window.setTimeout(() => {
      setSession((prev) => {
        if (!prev || !isSkyjoSession(prev)) return prev
        const g = prev.gameState
        if (g.phase === 'roundOver' || g.currentPlayer < firstAiSeatIndex(prev)) return prev
        const act = prev.module.selectAiAction(prev.table, prev.gameState, g.currentPlayer, Math.random, {
          difficulty: difficultyForAiPlayer(prev, g.currentPlayer),
          matchCumulativeScores: prev.match?.cumulativeScores,
          matchTargetScore: prev.match?.config.targetScore,
        })
        if (!act) return prev
        const r = prev.module.applyAction(prev.table, prev.gameState, act)
        if (r.error) return prev
        return { ...prev, table: r.table, gameState: r.gameState }
      })
    }, 650)

    return () => window.clearTimeout(handle)
  }, [session])

  useEffect(() => {
    if (!session) return
    if (!isSkyjoSession(session)) return
    if (skyjoDumpUiStepShouldReset(session.gameState)) {
      setSkyjoDumpStep('idle')
    }
  }, [session])

  useEffect(() => {
    setAiDifficulties((prev) => {
      const next = prev.slice(0, aiOpponents)
      while (next.length < aiOpponents) next.push('medium')
      return next
    })
  }, [aiOpponents])

  useEffect(() => {
    if (!session) return
    if (!isGoFishSession(session)) return
    const g = session.gameState
    if (g.phase !== 'playing' || g.currentPlayer !== shellHumanSeat(session)) {
      setGfAwaitingOpponent(false)
    }
  }, [session])

  const aiCountLocked = Boolean(session?.match && !session.match.complete)

  const tableIntentZones = useMemo((): readonly string[] | undefined => {
    if (!session || networkSpectator) return undefined
    const sh = shellHumanSeat(session)
    if (isSkyjoSession(session) && session.gameState.phase !== 'roundOver' && session.gameState.currentPlayer === sh) {
      const gs = session.gameState
      if (gs.pendingDraw) {
        if (gs.pendingFromDiscard) return [`grid:${sh}`]
        return [`grid:${sh}`, 'discard']
      }
      return ['draw', `grid:${sh}`]
    }
    if (isGoFishSession(session) && session.gameState.phase === 'playing' && session.gameState.currentPlayer === sh) {
      const pc = session.gameState.playerCount
      if (!gfAwaitingOpponent) {
        return [`hand:${sh}`]
      }
      return [`hand:${sh}`, ...goFishOpponentIntentZones(pc)]
    }
    return undefined
  }, [session, gfAwaitingOpponent, networkSpectator])

  const handleTableIntent = useCallback(
    (intent: TableIntent) => {
      if (!session || networkSpectator) return
      const sh = shellHumanSeat(session)
      const myGrid = `grid:${sh}`
      const myHand = `hand:${sh}`
      if (isSkyjoSession(session)) {
        const gs = session.gameState
        if (gs.phase === 'roundOver' || gs.currentPlayer !== sh) return

        if (intent.kind === 'stack' && intent.zoneId === 'draw') {
          dispatchAction({ type: 'skyjoDraw', from: 'deck' })
          return
        }

        if (intent.kind === 'stack' && intent.zoneId === 'discard') {
          if (!gs.pendingDraw || gs.pendingFromDiscard) return
          setSkyjoDumpStep((s) => (s === 'selectFlip' ? 'idle' : 'selectFlip'))
          return
        }

        if (intent.kind === 'card' && intent.zoneId === myGrid) {
          const idx = intent.cardIndex
          const grid = session.table.zones[myGrid]?.cards
          const cell = grid?.[idx]
          if (gs.pendingDraw) {
            const legalDumpTarget =
              !!cell &&
              !cell.faceUp &&
              !gs.pendingFromDiscard &&
              !isSkyjoSlotTemplateId(cell.templateId)

            if (skyjoDumpStep === 'selectFlip') {
              if (legalDumpTarget) {
                dispatchAction({ type: 'skyjoDumpDraw', flipIndex: idx })
              } else {
                window.alert('Choose a face-down card on your grid to complete dump & flip (or click the discard pile again to cancel).')
              }
              return
            }

            const canDumpShortcut =
              intent.modifiers.shiftKey && legalDumpTarget
            if (canDumpShortcut) {
              dispatchAction({ type: 'skyjoDumpDraw', flipIndex: idx })
            } else {
              dispatchAction({ type: 'skyjoSwapDrawn', gridIndex: idx })
            }
          } else {
            if (
              gs.discardSwapFaceUpOnly &&
              (!cell || isSkyjoSlotTemplateId(cell.templateId) || !cell.faceUp)
            ) {
              window.alert(
                'House rule: take the discard only by clicking a face-up card on your grid (the card you will replace).',
              )
              return
            }
            dispatchAction({ type: 'skyjoTakeDiscard', gridIndex: idx })
          }
        }
        return
      }

      if (isGoFishSession(session)) {
        const gs = session.gameState
        if (gs.phase !== 'playing' || gs.currentPlayer !== sh) return

        if (intent.kind === 'card' && intent.zoneId === myHand) {
          const card = session.table.zones[myHand]?.cards[intent.cardIndex]
          const r = card && session.table.templates[card.templateId]?.rank
          if (typeof r === 'string') {
            setGfRank(r)
            setGfAwaitingOpponent(true)
          }
          return
        }

        if (!gfAwaitingOpponent) return

        if (intent.kind === 'card' || intent.kind === 'zone') {
          const target = goFishTargetPlayerFromZoneId(intent.zoneId)
          if (target === null || target === sh) return
          const rank =
            humanRanks.includes(gfRank) ? gfRank : humanRanks[0] ?? ''
          if (!rank) {
            window.alert('You have no cards to ask with.')
            return
          }
          const action: GameAction = { type: 'goFishAsk', targetPlayer: target, rank }
          const preview = session.module.applyAction(session.table, session.gameState, action)
          if (preview.error) {
            window.alert(preview.error)
            return
          }
          dispatchAction(action)
          setGfAwaitingOpponent(false)
        }
      }
    },
    [session, networkSpectator, dispatchAction, skyjoDumpStep, gfAwaitingOpponent, gfRank, humanRanks],
  )

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Card table</h1>
        <p className="app__subtitle">Runs entirely in your browser — decks and manifests are YAML.</p>
        <div className="app__toolbar">
          <div className="app__toolbarMain">
            <div className="app__toolbarLeft">
              <div className="app__toolbarRow app__toolbarRow--controls">
                <div className="app__toolbarControls">
                  <label className="app__label">
                    Game
                    <select
                      className="app__select"
                      value={gameId}
                      disabled={onlineClientShell}
                      title={
                        onlineClientShell
                          ? 'Game is chosen by the host while you are in an online room.'
                          : undefined
                      }
                      onChange={(e) => onGameIdChange(e.target.value as (typeof GAME_IDS)[number])}
                    >
                      {GAME_IDS.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  </label>
                  {gameSupportsConfigurableAi(gameId) && (
                    <label className="app__label">
                      AI opponents
                      <input
                        className="app__inputNumber"
                        type="number"
                        min={1}
                        max={MAX_AI_OPPONENTS}
                        value={aiOpponents}
                        disabled={aiCountLocked || onlineClientShell}
                        title={
                          onlineClientShell
                            ? 'Player count is set by the host while you are in an online room.'
                            : aiCountLocked
                              ? 'Finish or advance the match before changing player count.'
                              : `1–${MAX_AI_OPPONENTS} computer players (${1 + aiOpponents} total). Applies on Start deal / New deal.`
                        }
                        onChange={(e) => {
                          const n = clampAiOpponentCount(gameId, Number(e.target.value))
                          setAiOpponents(n)
                        }}
                      />
                    </label>
                  )}
                  <div className="app__toolbarActions">
                    {!onlineClientShell && <span className="app__toolbarActionsLabel">Actions</span>}
                    <div className="app__toolbarActionsBtns">
                      {!onlineClientShell && (
                        <button
                          type="button"
                          className="app__btnToolbar app__btnSecondary"
                          onClick={startOrNewDeal}
                        >
                          {session ? 'New deal' : 'Start deal'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="app__btnSecondary app__btnToolbar"
                        onClick={() => setRulesOpen(true)}
                      >
                        Rules
                      </button>
                      {!onlineClientShell && (
                        <button type="button" className="app__btnSecondary app__btnToolbar" onClick={endGame}>
                          End game
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {gameSupportsPerSeatAiDifficulty(gameId) && aiOpponents >= 1 && (
                <div className="app__toolbarRow app__toolbarRow--diff" role="group" aria-label="AI player difficulty">
                  {Array.from({ length: aiOpponents }, (_, i) => (
                    <label key={i} className="app__label app__label--inline">
                      {aiPlayerMenuLabel(i)}
                      <select
                        className="app__select app__select--diff"
                        value={aiDifficulties[i] ?? 'medium'}
                        disabled={aiCountLocked || onlineClientShell}
                        title={
                          onlineClientShell
                            ? 'AI settings are controlled by the host while you are in an online room.'
                            : aiCountLocked
                              ? 'Finish or advance the match before editing AI settings.'
                              : 'Locked for this deal. Changing starts a new deal.'
                        }
                        onChange={(e) => {
                          const v = normalizeAiDifficulty(e.target.value)
                          if (
                            session &&
                            !window.confirm(
                              'Changing AI difficulty starts a new deal. Progress for this hand is lost. Continue?',
                            )
                          ) {
                            return
                          }
                          const next = [...aiDifficulties]
                          next[i] = v
                          while (next.length < aiOpponents) next.push('medium')
                          setAiDifficulties(next)
                          if (session) {
                            const hosting = !!roomHostRef.current
                            const s = attachHostSeatProfilesIfNeeded(
                              createSession(gameId, Math.random, undefined, makeDealOptions(undefined, gameId, next)),
                              gameId,
                              hosting,
                            )
                            setSession(s)
                            setSkyjoDumpStep('idle')
                            setGfAwaitingOpponent(false)
                            setGfRank('A')
                          }
                        }}
                      >
                        {AI_DIFFICULTY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {session?.match && (
              <div className="app__toolbarScores">
                <MatchCumulativePanel
                  match={session.match}
                  toolbar
                  scoreColumnLabel={session.manifest.match?.scoreLabel ?? 'Total'}
                  caption={
                    session.manifest.match?.scoringMode === 'chips' ? 'Cumulative chips' : 'Cumulative scores'
                  }
                  scoringMode={session.manifest.match?.scoringMode === 'chips' ? 'chips' : 'points'}
                  pendingRoundScores={pendingMergeRoundScores}
                  playerSeatCaption={cumulativeRowCaption}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {gameSupportsOnlineMultiplayer(gameId) && (
        <MultiplayerPanel
          gameId={gameId}
          maxClients={MAX_REMOTE_HUMANS}
          tableActive={!!session}
          onHostStarted={onHostStarted}
          onClientStarted={onClientStarted}
          onSessionSnapshot={onSessionSnapshot}
          onRemoteIntent={onRemoteIntent}
          onRemoteSetDisplayName={onRemoteSetDisplayName}
          onHostingRosterChange={onHostingRosterChange}
          onTeardown={onMultiplayerTeardown}
          onPeerAck={onPeerAck}
          nameplate={
            multiplayerNameplate
              ? { ...multiplayerNameplate, onCommit: handleNameplateCommit }
              : undefined
          }
        />
      )}

      {!session && (
        <p className="app__lobbyHint" role="status">
          {joinedAsClient ? (
            'Waiting for the host to deal — the table appears here when they start.'
          ) : (
            <>
              Select a game, adjust AI options if needed, then press <strong>Start deal</strong>.
            </>
          )}
        </p>
      )}

      {session && (
        <>
          <p className="app__status" role="status">
            {networkSpectator ? `${status} (spectating until the next deal)` : status}
          </p>

          {matchPreviewTotals && session.match && !session.match.complete && (
            <p className="app__matchPreview" role="status">
              Totals if you merge this round:{' '}
              {matchPreviewTotals.map((s, i) => (
                <span key={i}>
                  {cumulativeRowCaption(i)}: {s}
                  {i < matchPreviewTotals.length - 1 ? ' · ' : ''}
                </span>
              ))}
            </p>
          )}
          {canAdvanceMatch && (
            <div className="app__matchActions">
              <button
                type="button"
                className="app__btnPrimary"
                onClick={onNextMatchRound}
                disabled={!!session?.net}
                title={session?.net ? 'Only the host can advance the match.' : undefined}
              >
                Next round (apply scores)
              </button>
            </div>
          )}

          <TableView
            table={session.table}
            humanPlayerIndex={tableViewHumanIndex(session)}
            getSeatDisplayName={seatDisplayName}
            onTableIntent={tableIntentZones ? handleTableIntent : undefined}
            intentZoneAllowlist={tableIntentZones}
            pendingStacksColumn={
              isSkyjoSession(session)
                ? {
                    card: session.gameState.pendingDraw,
                    skyjoDumpStep:
                      session.gameState.currentPlayer === shellHumanSeat(session) ? skyjoDumpStep : 'idle',
                  }
                : undefined
            }
            activeTurnHighlight={activeTurnHighlight}
          />

          <div className="app__actions">
            {gameId === 'go-fish' &&
              isGoFishSession(session) &&
              session.gameState.phase === 'playing' &&
              session.gameState.currentPlayer === shellHumanSeat(session) && (
                <div className="app__goFish">
                  <p className="app__tableIntentHint">
                    {gfAwaitingOpponent
                      ? 'Click an opponent’s hand or books pile to ask for that rank.'
                      : 'Click a card in your hand to choose the rank, then click an opponent’s hand or books.'}
                  </p>
                  {legal.some((a) => a.type === 'goFishPass') && (
                    <button
                      type="button"
                      className="app__btnSecondary"
                      disabled={networkSpectator}
                      onClick={() => dispatchAction({ type: 'goFishPass' })}
                    >
                      Pass turn
                    </button>
                  )}
                </div>
              )}

            {gameId === 'skyjo' &&
              isSkyjoSession(session) &&
              session.gameState.phase !== 'roundOver' &&
              session.gameState.currentPlayer === shellHumanSeat(session) && (
                <div className="app__skyjo">
                  <p className="app__tableIntentHint">
                    Draw from the deck (left). With a pending card from the deck, click the discard pile to start dump
                    &amp; flip, then a face-down grid card — or Shift+click a face-down card to do it in one step. Click
                    the grid to swap, or (no pending) click the grid to take the visible discard. Pending from the
                    discard pile must be placed (no dump).
                  </p>
                  {session.gameState.discardSwapFaceUpOnly && (
                    <p className="app__tableIntentHint app__tableIntentHint--sub">
                      House rule: you may only take the discard by choosing a <strong>face-up</strong> card to replace;
                      face-down spaces are filled from the deck only.
                    </p>
                  )}
                </div>
              )}

            {legalCustomActions.length > 0 && (
              <div className="app__customActions" role="group" aria-label="Game actions">
                {legalCustomActions.map((a) => (
                  <button
                    key={customActionKey(a)}
                    type="button"
                    className="app__btnSecondary"
                    disabled={networkSpectator}
                    title={networkSpectator ? 'Spectating — actions are disabled.' : undefined}
                    onClick={() => dispatchAction(a)}
                  >
                    {labelCustomAction(a)}
                  </button>
                ))}
              </div>
            )}

            {gameId !== 'go-fish' && gameId !== 'skyjo' && !hidePlayRoundButton && (
              <button
                type="button"
                className="app__btnPrimary"
                onClick={onPrimary}
                disabled={legal.length === 0 || networkSpectator}
                title={networkSpectator ? 'Spectating — actions are disabled.' : undefined}
              >
                {primaryLabel}
              </button>
            )}
          </div>

          <footer className="app__footer">
            <span>
              {session.manifest.name} — deck <code>{session.manifest.deck}</code> — module{' '}
              <code>{session.manifest.module}</code>
            </span>
          </footer>
        </>
      )}

      <RulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        markdown={rulesTextForGame(gameId as RulesGameId)}
        optionsPanel={
          <GameHouseRulesPanel
            gameId={gameId as RulesGameId}
            manifest={session?.manifest ?? selectedManifest}
            readOnly={onlineClientShell}
          />
        }
      />
    </div>
  )
}

export default App
