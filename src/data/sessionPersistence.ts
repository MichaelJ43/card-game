import type { AiDifficulty } from '../core/aiContext'
import { GAME_IDS } from './manifests'
import type { SessionSnapshotWire } from '../net/sessionSnapshot'

const SELECTED_GAME_KEY = 'card-game:selected-game:v1'
const AI_PREFS_KEY = 'card-game:ai-prefs:v1'
const SOLO_SESSION_KEY = 'card-game:solo-session:v1'
const MP_SESSION_KEY = 'card-game:multiplayer-session:v1'

/** Match lambda default room JWT TTL when env unset (see lambda `ROOM_TTL_SECONDS`). */
export const RESUME_MAX_AGE_MS = 60 * 60 * 24 * 1000

export type GameId = (typeof GAME_IDS)[number]

export interface AiPrefsStored {
  aiCount: number
  aiDifficulties: AiDifficulty[]
}

export interface SoloSessionStored {
  v: 1
  ts: number
  wire: SessionSnapshotWire
}

export interface MultiplayerHostStored {
  v: 1
  ts: number
  role: 'host'
  gameId: string
  maxClients: number
  roomCode: string
  wsUrl: string
  hostPeerId: string
  token: string
  seatBindings: Record<string, number>
  /** Full host-authoritative wire; omit only before first deal. */
  wire: SessionSnapshotWire | null
}

export interface MultiplayerClientStored {
  v: 1
  ts: number
  role: 'client'
  gameId: string
  roomCode: string
  wsUrl: string
  hostPeerId: string
  clientPeerId: string
  token: string
  /** Last snapshot payload for instant UI while WebRTC reconnects. */
  lastWire: SessionSnapshotWire | null
}

export type MultiplayerStored = MultiplayerHostStored | MultiplayerClientStored

function isFresh(ts: number): boolean {
  return Date.now() - ts < RESUME_MAX_AGE_MS
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function setItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* quota / private mode */
  }
}

function removeItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function isKnownGameId(id: string): id is GameId {
  return (GAME_IDS as readonly string[]).includes(id)
}

export function readSelectedGameId(): GameId | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(SELECTED_GAME_KEY)
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as { id?: unknown }
    const id = typeof o.id === 'string' ? o.id : null
    if (!id || !isKnownGameId(id)) return null
    return id
  } catch {
    return null
  }
}

export function writeSelectedGameId(id: GameId): void {
  setItem(SELECTED_GAME_KEY, JSON.stringify({ id }))
}

type AiPrefsMap = Partial<Record<GameId, AiPrefsStored>>

export function readAiPrefs(gameId: GameId): AiPrefsStored | null {
  if (typeof window === 'undefined') return null
  const all = safeParse<AiPrefsMap>(localStorage.getItem(AI_PREFS_KEY))
  if (!all || typeof all !== 'object') return null
  const row = all[gameId]
  if (!row || typeof row.aiCount !== 'number' || !Array.isArray(row.aiDifficulties)) return null
  return { aiCount: row.aiCount, aiDifficulties: row.aiDifficulties as AiDifficulty[] }
}

export function writeAiPrefs(gameId: GameId, prefs: AiPrefsStored): void {
  const all = safeParse<AiPrefsMap>(localStorage.getItem(AI_PREFS_KEY)) ?? {}
  all[gameId] = { aiCount: prefs.aiCount, aiDifficulties: prefs.aiDifficulties }
  setItem(AI_PREFS_KEY, JSON.stringify(all))
}

export function readSoloSession(): SoloSessionStored | null {
  if (typeof window === 'undefined') return null
  const o = safeParse<SoloSessionStored>(localStorage.getItem(SOLO_SESSION_KEY))
  if (!o || o.v !== 1 || !o.wire || typeof o.ts !== 'number' || !isFresh(o.ts)) return null
  if (!isKnownGameId(o.wire.gameId)) return null
  return o
}

export function writeSoloSession(wire: SessionSnapshotWire): void {
  const row: SoloSessionStored = { v: 1, ts: Date.now(), wire }
  setItem(SOLO_SESSION_KEY, JSON.stringify(row))
}

export function clearSoloSession(): void {
  removeItem(SOLO_SESSION_KEY)
}

export function readMultiplayerSession(): MultiplayerStored | null {
  if (typeof window === 'undefined') return null
  const o = safeParse<MultiplayerStored>(localStorage.getItem(MP_SESSION_KEY))
  if (!o || o.v !== 1 || typeof o.ts !== 'number' || !isFresh(o.ts)) return null
  if (o.role === 'host') {
    if (
      typeof o.roomCode !== 'string' ||
      typeof o.wsUrl !== 'string' ||
      typeof o.hostPeerId !== 'string' ||
      typeof o.token !== 'string' ||
      typeof o.gameId !== 'string' ||
      typeof o.maxClients !== 'number' ||
      !o.seatBindings ||
      typeof o.seatBindings !== 'object'
    ) {
      return null
    }
    return o
  }
  if (o.role === 'client') {
    if (
      typeof o.roomCode !== 'string' ||
      typeof o.wsUrl !== 'string' ||
      typeof o.hostPeerId !== 'string' ||
      typeof o.clientPeerId !== 'string' ||
      typeof o.token !== 'string' ||
      typeof o.gameId !== 'string'
    ) {
      return null
    }
    return o
  }
  return null
}

export function writeMultiplayerSession(row: MultiplayerStored): void {
  setItem(MP_SESSION_KEY, JSON.stringify({ ...row, ts: Date.now() }))
}

export function clearMultiplayerSession(): void {
  removeItem(MP_SESSION_KEY)
}

/** Shallow merge host fields without replacing whole object reference semantics for callers. */
export function patchMultiplayerHost(patch: Partial<Omit<MultiplayerHostStored, 'v' | 'role'>>): void {
  const cur = readMultiplayerSession()
  if (!cur || cur.role !== 'host') return
  writeMultiplayerSession({ ...cur, ...patch, v: 1, role: 'host', ts: Date.now() })
}

export function patchMultiplayerClient(patch: Partial<Omit<MultiplayerClientStored, 'v' | 'role'>>): void {
  const cur = readMultiplayerSession()
  if (!cur || cur.role !== 'client') return
  writeMultiplayerSession({ ...cur, ...patch, v: 1, role: 'client', ts: Date.now() })
}
