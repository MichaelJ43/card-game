import type { SelectAiContext } from '../../core/gameModule'
import type { GameAction } from '../../core/types'
import type { TableState } from '../../core/types'
import {
  SUITS,
  bestSuitOnEight,
  cmd,
  enumerateCrazy8Plays,
  handId,
  rankC8Strength,
} from './helpers'
import type { Crazy8sGameState } from './types'

/** Crazy Eights AI: random tiers plus suit choice on eights. */
export function crazy8sSelectAiAction(
  table: TableState,
  gs: Crazy8sGameState,
  playerIndex: number,
  rng: () => number,
  context: SelectAiContext,
): GameAction | null {
  if (gs.phase !== 'play' || gs.currentPlayer !== playerIndex) return null
  const d = context.difficulty
  const tpl = table.templates
  const hz = table.zones[handId(playerIndex)]!.cards
  const actions = enumerateCrazy8Plays(table, gs, playerIndex)
  if (actions.length === 0) return null

  type CustomA = Extract<GameAction, { type: 'custom' }>
  const plays = actions.filter((a): a is CustomA => a.type === 'custom' && cmd(a.payload) === 'c8Play')
  const draws = actions.filter((a): a is CustomA => a.type === 'custom' && cmd(a.payload) === 'c8Draw')

  const hasPlay = plays.length > 0
  if (d === 'easy' && hasPlay && draws.length > 0 && rng() < 0.28) {
    return draws[0]!
  }

  if (!hasPlay) return draws[0] ?? null

  if (d === 'easy' || d === 'medium') {
    const a = plays[Math.floor(rng() * plays.length)]!
    const p = a.payload as { index?: number; suit?: string }
    const i = Number(p.index)
    const c = hz[i]!
    if (tpl[c.templateId]?.rank === '8') {
      const s =
        p.suit && SUITS.includes(p.suit as (typeof SUITS)[number])
          ? p.suit
          : bestSuitOnEight(table, hz, i, tpl, rng, d)
      return { type: 'custom', payload: { cmd: 'c8Play', index: i, suit: s } }
    }
    return { type: 'custom', payload: { cmd: 'c8Play', index: i } }
  }

  const score = (a: CustomA): number => {
    const c0 = cmd(a.payload as Record<string, unknown>)
    if (c0 === 'c8Draw') return 5000
    const p = a.payload as { index?: number }
    const i = Number(p.index)
    const t = hz[i]!
    const r = tpl[t.templateId]?.rank
    if (r === '8') return 1200
    return 1000 - rankC8Strength(r)
  }

  if (d === 'hard' || d === 'expert') {
    if (d === 'expert' && rng() < 0.12) {
      const eights = plays.filter((a) => {
        const i = Number((a.payload as { index?: number }).index)
        return tpl[hz[i]!.templateId]?.rank === '8'
      })
      const non8 = plays.filter((a) => {
        const i2 = Number((a.payload as { index?: number }).index)
        return tpl[hz[i2]!.templateId]?.rank !== '8'
      })
      if (eights.length > 0 && non8.length > 0 && rng() < 0.55) {
        const a = non8.sort((a, b) => score(a) - score(b))[0]!
        const p = a.payload as { index?: number }
        return { type: 'custom', payload: { cmd: 'c8Play', index: p.index } }
      }
    }
    const best = plays.slice().sort((a, b) => score(a) - score(b))[0]!
    const p = best.payload as { index?: number; suit?: string }
    const i = Number(p.index)
    if (tpl[hz[i]!.templateId]?.rank === '8') {
      const s = bestSuitOnEight(table, hz, i, tpl, rng, d)
      return { type: 'custom', payload: { cmd: 'c8Play', index: i, suit: s } }
    }
    return { type: 'custom', payload: { cmd: 'c8Play', index: i } }
  }
  return plays[0]!
}
