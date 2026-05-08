import { isDeckDrawAvailableAfterOptionalRecycle } from '../../core/discardRecycle'
import type { CardInstance, CardTemplate, GameAction, GameManifestYaml } from '../../core/types'
import type { TableState } from '../../core/types'
import type { ThirtyOneGameState } from './types'

export function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

export function handZoneCount(table: TableState): number {
  return Object.keys(table.zones).filter((id) => /^hand:\d+$/.test(id)).length
}

export function handId(i: number): string {
  return `hand:${i}`
}

export function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

export function pipValue(rank: string | undefined): number {
  if (rank === 'A') return 11
  if (rank === 'K' || rank === 'Q' || rank === 'J' || rank === '10') return 10
  const n = Number(rank)
  return Number.isFinite(n) ? n : 0
}

export function handScore31(templates: Record<string, CardTemplate>, hand: CardInstance[]): number {
  const bySuit = new Map<string, number>()
  for (const c of hand) {
    const t = templates[c.templateId]
    const suit = typeof t?.suit === 'string' ? t.suit : 'x'
    const r = typeof t?.rank === 'string' ? t.rank : ''
    bySuit.set(suit, (bySuit.get(suit) ?? 0) + pipValue(r))
  }
  let best = 0
  for (const v of bySuit.values()) {
    if (v <= 31) best = Math.max(best, v)
  }
  return best
}

export function showdownScores(table: TableState, pc: number): { winner: number } {
  const scores: number[] = []
  for (let i = 0; i < pc; i++) {
    scores.push(handScore31(table.templates, table.zones[handId(i)]!.cards))
  }
  let winner = 0
  for (let i = 1; i < pc; i++) {
    if (scores[i]! > scores[winner]!) winner = i
  }
  return { winner }
}

export function legalForSeat(table: TableState, gs: ThirtyOneGameState, cur: number): GameAction[] {
  if (gs.phase !== 'play' || cur !== gs.currentPlayer) return []
  const hz = table.zones[handId(cur)]!.cards
  if (hz.length !== 3) return []
  const out: GameAction[] = []
  out.push({ type: 'custom', payload: { cmd: 't31Knock' } })
  if (isDeckDrawAvailableAfterOptionalRecycle(table, gs.reshuffleDiscardWhenDrawEmpty, true)) {
    for (let i = 0; i < hz.length; i++) {
      out.push({ type: 'custom', payload: { cmd: 't31DrawStock', discardIndex: i } })
    }
  }
  const disc = table.zones.discard!.cards
  if (disc.length > 0) {
    for (let i = 0; i < hz.length; i++) {
      out.push({ type: 'custom', payload: { cmd: 't31TakeDiscard', discardIndex: i } })
    }
  }
  return out
}
