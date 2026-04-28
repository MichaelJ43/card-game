import type { AiDifficulty } from '../core/aiContext'
import type { GameManifestYaml } from '../core/types'
import type { GameSession } from '../session'

export type GameTableRole = 'solo' | 'host' | 'client' | 'spectator'

const EVENT_GAME_START = 'game_start'
const EVENT_MATCH_ROUND_START = 'match_round_start'

function track(eventType: string, context: Record<string, unknown>, path?: string): void {
  const m43 = (globalThis as unknown as { M43Analytics?: { trackPageview?: (p?: unknown) => void } }).M43Analytics
  if (typeof m43?.trackPageview !== 'function') return
  try {
    const p =
      typeof location !== 'undefined'
        ? `${location.pathname}${location.search}`
        : '/'
    m43.trackPageview({
      eventType,
      context,
      path: path ?? p,
    })
  } catch {
    /* ignore */
  }
}

function manifestTotals(manifest: GameManifestYaml): {
  aiCount: number
  localHumans: number
  totalSeats: number
} {
  const human = manifest.players.human
  const ai = manifest.players.ai
  return { aiCount: ai, localHumans: human, totalSeats: human + ai }
}

function stringifyDifficulties(d: AiDifficulty[] | undefined): string[] | undefined {
  if (!d?.length) return undefined
  return d.slice()
}

/**
 * Payload `context` for m43 ingest (persisted API-side under `properties`).
 */
export function buildGameTableContext(
  sess: GameSession,
  role: GameTableRole,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const { aiCount, localHumans, totalSeats } = manifestTotals(sess.manifest)
  const human = sess.manifest.players.human
  const remoteHumans = Math.max(0, human - 1)
  const spectator = !!sess.net?.spectator
  const base: Record<string, unknown> = {
    game: String(sess.manifest.id),
    aiCount,
    localHumans,
    remoteHumans,
    totalSeats,
    spectator,
    multiplayer: !!(sess.net || remoteHumans > 0),
    role,
    matchRoundIndex: sess.match?.completedRoundScores?.length ?? 0,
  }
  const diff = stringifyDifficulties(sess.aiPlayerConfig?.difficulties)
  if (diff) base.aiDifficulties = diff

  return { ...base, ...(extra ?? {}) }
}

export function trackGameStart(sess: GameSession, role: GameTableRole, extra?: Record<string, unknown>): void {
  track(EVENT_GAME_START, buildGameTableContext(sess, role, { matchContinuation: false, ...extra }))
}

/** Next hand in the same match (scores carry across rounds). */
export function trackMatchRoundStart(sess: GameSession, role: GameTableRole, extra?: Record<string, unknown>): void {
  track(
    EVENT_MATCH_ROUND_START,
    buildGameTableContext(sess, role, { matchContinuation: true, ...extra }),
  )
}
