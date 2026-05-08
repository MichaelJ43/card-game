import type { AiDifficulty } from '../../core/aiContext'
import { aiIsExpert } from '../../core/aiPlaystyle'
import { isDeckDrawAvailableAfterOptionalRecycle } from '../../core/discardRecycle'
import type { CardInstance, CardTemplate, GameAction, GameManifestYaml } from '../../core/types'
import type { TableState } from '../../core/types'
import type { Crazy8sGameState } from './types'

export function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

export function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

export function handId(i: number): string {
  return `hand:${i}`
}

export function topDiscard(table: TableState): { templateId: string } | null {
  const d = table.zones.discard?.cards
  const c = d?.[d.length - 1]
  return c ? { templateId: c.templateId } : null
}

export function canPlay(
  templates: Record<string, CardTemplate>,
  cardId: string,
  top: { templateId: string },
  suit: string,
): boolean {
  const t = templates[cardId]
  const topT = templates[top.templateId]
  if (t?.rank === '8') return true
  if (t?.rank === topT?.rank) return true
  if (t?.suit === suit || t?.suit === topT?.suit) return true
  return false
}

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const

export function rankC8Strength(rank: string | undefined): number {
  if (!rank) return 0
  if (rank === 'A') return 14
  if (rank === 'K') return 13
  if (rank === 'Q') return 12
  if (rank === 'J') return 11
  if (rank === '8') return 0
  const n = Number(rank)
  return Number.isFinite(n) ? n : 0
}

export function enumerateCrazy8Plays(
  table: TableState,
  gs: Crazy8sGameState,
  playerIndex: number,
): GameAction[] {
  const top = topDiscard(table)
  if (!top) return []
  const hz = table.zones[handId(playerIndex)]!.cards
  const out: GameAction[] = []
  hz.forEach((c, i) => {
    if (canPlay(table.templates, c.templateId, top, gs.currentSuit)) {
      if (table.templates[c.templateId]?.rank === '8') {
        for (const s of SUITS) {
          out.push({ type: 'custom', payload: { cmd: 'c8Play', index: i, suit: s } })
        }
      } else {
        out.push({ type: 'custom', payload: { cmd: 'c8Play', index: i } })
      }
    }
  })
  if (isDeckDrawAvailableAfterOptionalRecycle(table, gs.reshuffleDiscardWhenDrawEmpty, true)) {
    out.push({ type: 'custom', payload: { cmd: 'c8Draw' } })
  }
  return out
}

export function bestSuitOnEight(
  _table: TableState,
  hand: CardInstance[],
  playIndex: number,
  templates: Record<string, CardTemplate>,
  rng: () => number,
  d: AiDifficulty,
): (typeof SUITS)[number] {
  const rem = hand.filter((_, j) => j !== playIndex)
  const countBySuit = (s: string) =>
    rem.filter((c) => (templates[c.templateId]?.suit as string | undefined) === s).length
  const scored = SUITS.map((s) => ({ s, n: countBySuit(s) })).sort((a, b) => b.n - a.n)
  if (d === 'easy' || d === 'medium') return scored[Math.floor(rng() * scored.length)]!.s
  if (d === 'hard') return scored[0]!.s
  if (aiIsExpert(d) && rng() < 0.14 && scored.length > 1) return scored[1]!.s
  return scored[0]!.s
}
