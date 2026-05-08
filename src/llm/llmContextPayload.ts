import type { GameSession } from '../session'
import type { RulesGameId } from '../data/rulesSources'
import { rulesTextForGame } from '../data/rulesSources'
import { getHouseRulesForGame } from '../data/houseRules'
import type { MoveLedgerEntry } from '../session/moveLedger'
import catalog from './generated/heuristic-catalog.json'

/** Trimmed rules markdown for the LLM (bounded on the server too). */
export function rulesDigestForGame(gameId: string, maxLen = 8000): string {
  try {
    const text = rulesTextForGame(gameId as RulesGameId)
    if (!text || typeof text !== 'string') return ''
    return text.length <= maxLen ? text : `${text.slice(0, maxLen)}…`
  } catch {
    return ''
  }
}

export function houseRulesPayload(gameId: string): Record<string, unknown> {
  const id = gameId as RulesGameId
  return { ...(getHouseRulesForGame(id) as Record<string, unknown>) }
}

export function matchContextPayload(session: GameSession): Record<string, unknown> | null {
  const m = session.match
  if (!m?.config) return null
  return {
    enabled: true,
    targetScore: m.config.targetScore,
    winnerIs: m.config.winnerIs,
    endCondition: m.config.endCondition,
    cumulativeScores: m.cumulativeScores,
    complete: m.complete,
  }
}

export function moveHistoryPayload(ledger: MoveLedgerEntry[] | undefined, maxEntries = 24): unknown[] {
  if (!ledger?.length) return []
  const slice = ledger.length > maxEntries ? ledger.slice(-maxEntries) : ledger
  return slice.map((e) => ({
    seq: e.seq,
    seat: e.seat,
    policy: e.policy,
    summary: e.summary,
  }))
}

export function heuristicCatalogExcerpt(gameId: string, maxLen = 5000): string {
  const rec = (catalog as Record<string, string>)[gameId]
  if (!rec || typeof rec !== 'string') return ''
  return rec.length <= maxLen ? rec : `${rec.slice(0, maxLen)}…`
}
