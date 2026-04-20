import { parseGameManifestYaml } from '../core/loadYaml'
import { getGameModule } from '../core/registry'
import type { GameModule } from '../core/gameModule'
import type { MatchState } from '../core/match'
import type { GameManifestYaml, TableState } from '../core/types'
import { GAME_SOURCES } from '../data/manifests'
import type { GameSession } from '../session'

/** Wire shape sent in {@link PeerHostSnapshot.state} for table sync. */
export interface SessionSnapshotWire {
  gameId: string
  table: TableState
  gameState: unknown
  match?: MatchState
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
    }
    return wire
  } catch {
    return null
  }
}

export function parseSessionSnapshot(value: unknown): GameSession | null {
  if (!isSessionSnapshotWire(value)) return null
  const gameId = value.gameId as keyof typeof GAME_SOURCES
  const raw = GAME_SOURCES[gameId]
  if (!raw) return null
  const manifest = parseGameManifestYaml(raw) as GameManifestYaml
  const mod = getGameModule(manifest.module)
  if (!mod) return null
  return {
    manifest,
    module: mod as GameModule,
    table: value.table,
    gameState: value.gameState,
    match: value.match,
    aiPlayerConfig: undefined,
  }
}
