import { parseGameManifestYaml } from '../core/loadYaml'
import { getGameModule } from '../core/registry'
import type { GameModule } from '../core/gameModule'
import type { MatchState } from '../core/match'
import type { GameManifestYaml, TableState } from '../core/types'
import { GAME_SOURCES } from '../data/manifests'
import type { AiPlayerConfig, GameSession } from '../session'
import type { SeatProfile } from '../session/seatProfiles'

/**
 * When the client falls back to YAML-only manifests (older hosts omitting `manifest` on the wire),
 * `players.human` can be too low (e.g. Skyjo defaults to 1 human) while the table already has a
 * `grid:N` zone per seat. Reconcile counts from the table so seat labels and spectator detection match.
 */
export function gridSeatCountFromTable(table: TableState): number | null {
  let max = -1
  for (const k of Object.keys(table.zones ?? {})) {
    const m = /^grid:(\d+)$/.exec(k)
    if (!m) continue
    max = Math.max(max, Number(m[1]))
  }
  if (max < 0) return null
  return max + 1
}

/** If the table has more grid seats than `human+ai`, grow humans (keeping AI when it still fits). */
export function reconcileManifestPlayersForTable(
  manifest: GameManifestYaml,
  table: TableState,
): GameManifestYaml {
  const gridCount = gridSeatCountFromTable(table)
  if (gridCount == null) return manifest
  const h = manifest.players.human
  const a = manifest.players.ai
  const total = h + a
  if (gridCount <= total) return manifest
  const nextAi = Math.min(a, Math.max(0, gridCount - 1))
  const nextHuman = gridCount - nextAi
  if (nextHuman < 1) return manifest
  return { ...manifest, players: { human: nextHuman, ai: nextAi } }
}

/** Wire shape sent in {@link PeerHostSnapshot.state} for table sync. */
export interface SessionSnapshotWire {
  gameId: string
  /**
   * Effective deal manifest (runtime player counts, match overrides, etc.).
   * When present, clients must prefer this over re-parsing YAML from {@link gameId} alone.
   */
  manifest?: GameManifestYaml
  table: TableState
  gameState: unknown
  match?: MatchState
  aiPlayerConfig?: AiPlayerConfig
  /** Host fills per client: network seat index (matches {@link PeerHostSnapshot.seat}). */
  viewerSeat?: number
  /** True when this seat is not in the current deal’s human slots (mid-join spectator). */
  spectator?: boolean
  /** Host-authored seat ids + display names (optional). */
  seatProfiles?: SeatProfile[]
}

export function parseWireSeatProfiles(raw: unknown): SeatProfile[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: SeatProfile[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as { seat?: unknown; id?: unknown; displayName?: unknown }
    const seat = Number(o.seat)
    const id = typeof o.id === 'string' ? o.id : ''
    const displayName = typeof o.displayName === 'string' ? o.displayName : ''
    if (!Number.isFinite(seat) || seat < 0 || !id) continue
    out.push({ seat, id, displayName: displayName.slice(0, 48) })
  }
  return out.length ? out : undefined
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
      manifest: JSON.parse(JSON.stringify(session.manifest)) as GameManifestYaml,
      table: JSON.parse(JSON.stringify(session.table)) as TableState,
      gameState: JSON.parse(JSON.stringify(session.gameState)),
      match: session.match ? (JSON.parse(JSON.stringify(session.match)) as MatchState) : undefined,
      aiPlayerConfig: session.aiPlayerConfig
        ? (JSON.parse(JSON.stringify(session.aiPlayerConfig)) as AiPlayerConfig)
        : undefined,
      seatProfiles: session.seatProfiles
        ? (JSON.parse(JSON.stringify(session.seatProfiles)) as SeatProfile[])
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
  let manifest = (
    w.manifest ? w.manifest : (parseGameManifestYaml(raw) as GameManifestYaml)
  ) as GameManifestYaml
  manifest = reconcileManifestPlayersForTable(manifest, w.table)
  const mod = getGameModule(manifest.module)
  if (!mod) return null
  const remoteHumans = Math.max(0, manifest.players.human - 1)
  const seat = typeof w.viewerSeat === 'number' ? w.viewerSeat : peerSeatFallback ?? 1
  const spectator = typeof w.spectator === 'boolean' ? w.spectator : seat > remoteHumans
  const seatProfiles = parseWireSeatProfiles(w.seatProfiles)
  return {
    manifest,
    module: mod as GameModule,
    table: w.table,
    gameState: w.gameState,
    match: w.match,
    aiPlayerConfig: w.aiPlayerConfig,
    net: { seat, spectator },
    seatProfiles,
  }
}
