import { parseGameManifestYaml } from '../core/loadYaml'
import { getGameModule } from '../core/registry'
import type { GameModule } from '../core/gameModule'
import type { MatchState } from '../core/match'
import type { GameManifestYaml, TableState } from '../core/types'
import { GAME_SOURCES } from '../data/manifests'
import type { AiPlayerConfig, GameSession } from '../session'

/** Wire shape sent in {@link PeerHostSnapshot.state} for table sync. */
export interface SessionSnapshotWire {
  gameId: string
  table: TableState
  gameState: unknown
  match?: MatchState
  aiPlayerConfig?: AiPlayerConfig
  /** Host fills per client: network seat index (matches {@link PeerHostSnapshot.seat}). */
  viewerSeat?: number
  /** True when this seat is not in the current deal’s human slots (mid-join spectator). */
  spectator?: boolean
}

export function isSessionSnapshotWire(value: unknown): value is SessionSnapshotWire {
  if (!value || typeof value !== 'object') return false
  const v = value as SessionSnapshotWire
  return typeof v.gameId === 'string' && v.table !== undefined && v.table !== null && 'gameState' in v
}

/** JSON-safe clone for host → DataChannel (drops functions / cycles). */
export function serializeSessionSnapshot(session: GameSession): SessionSnapshotWire | null {
  try {
    const wire: SessionSnapshotWire = {
      gameId: session.manifest.id,
      table: JSON.parse(JSON.stringify(session.table)) as TableState,
      gameState: JSON.parse(JSON.stringify(session.gameState)),
      match: session.match ? (JSON.parse(JSON.stringify(session.match)) as MatchState) : undefined,
      aiPlayerConfig: session.aiPlayerConfig
        ? (JSON.parse(JSON.stringify(session.aiPlayerConfig)) as AiPlayerConfig)
        : undefined,
    }
    return wire
  } catch {
    return null
  }
}

export function parseSessionSnapshot(value: unknown, peerSeatFallback?: number): GameSession | null {
  if (!isSessionSnapshotWire(value)) return null
  const w = value as SessionSnapshotWire
  const gameId = w.gameId as keyof typeof GAME_SOURCES
  const raw = GAME_SOURCES[gameId]
  if (!raw) return null
  const manifest = parseGameManifestYaml(raw) as GameManifestYaml
  const mod = getGameModule(manifest.module)
  if (!mod) return null
  const remoteHumans = Math.max(0, manifest.players.human - 1)
  const seat = typeof w.viewerSeat === 'number' ? w.viewerSeat : peerSeatFallback ?? 1
  const spectator = typeof w.spectator === 'boolean' ? w.spectator : seat > remoteHumans
  return {
    manifest,
    module: mod as GameModule,
    table: w.table,
    gameState: w.gameState,
    match: w.match,
    aiPlayerConfig: w.aiPlayerConfig,
    net: { seat, spectator },
  }
}
