import { aiIsHardOrExpert } from '../../core/aiPlaystyle'
import type { SelectAiContext } from '../../core/gameModule'
import type { CardInstance, CardTemplate, GameAction } from '../../core/types'
import type { TableState } from '../../core/types'
import { cmd, handId, handValue, tpl, uc, uface } from './helpers'
import { computeLegalActions } from './logic'
import type { UnoColor, UnoGameState } from './types'

function countColorInHand(
  templates: Record<string, CardTemplate>,
  hz: CardInstance[],
  col: UnoColor,
): number {
  let n = 0
  for (const c of hz) {
    const t = templates[c.templateId]!
    if (uc(t) === col || uc(t) === 'w') n += 1
  }
  return n
}

function scoreUnoAction(
  a: GameAction,
  table: TableState,
  gs: UnoGameState,
  playerIndex: number,
): number {
  if (a.type !== 'custom') return -9999
  const c0 = cmd(a.payload)
  if (c0 === 'unoDraw' || c0 === 'unoPass' || c0 === 'unoPassAfterDraw') return -100
  if (c0 !== 'unoPlay') return 0
  const pCount = Object.keys(table.zones).filter((k) => k.startsWith('hand:')).length
  const nextP = (playerIndex + gs.direction + pCount * 100) % pCount
  const nextHandN = table.zones[handId(nextP)]!.cards.length
  const hz = table.zones[handId(playerIndex)]!.cards
  const ix = Number((a.payload as { index?: number }).index)
  const card = hz[ix]!
  const ct = table.templates[card.templateId]!
  const colPick = (a.payload as { color?: string }).color as UnoColor | undefined
  const uf0 = uface(ct)
  let s = 200
  if (uc(ct) === 'w') s -= 40
  else s -= handValue(table.templates, [card]) * 0.4
  if (colPick) s += countColorInHand(table.templates, hz, colPick) * 2.1
  if (nextHandN <= 2 && (uf0 === 'd2' || uf0 === 'w4' || uf0 === 'sk')) s += 35
  if (uf0 === 'd2' || uf0 === 'w4' || uf0 === 'sk' || uf0 === 'rev') s += 8
  return s
}

/**
 * Heuristic table AI for Uno seats.
 */
export function unoSelectAiAction(
  table: TableState,
  gs: UnoGameState,
  playerIndex: number,
  rng: () => number,
  context: SelectAiContext,
): GameAction | null {
  type CustomAction = Extract<GameAction, { type: 'custom' }>
  const d = context.difficulty
  const legals = computeLegalActions(table, gs, playerIndex, rng) as CustomAction[]
  if (legals.length === 0) return null

  const byCmd = (s: string) => legals.filter((a) => cmd(a.payload) === s)
  const passAfter = byCmd('unoPassAfterDraw')
  const playActs = byCmd('unoPlay')
  if (passAfter.length && playActs.length > 0) {
    if (d === 'easy' && rng() < 0.35) return passAfter[0]!
    if (d === 'medium' && rng() < 0.25) return passAfter[0]!
    if (aiIsHardOrExpert(d) && rng() < 0.08) return passAfter[0]!
    if (d === 'easy' || d === 'medium') {
      return rng() < 0.72 ? playActs[Math.floor(rng() * playActs.length)]! : passAfter[0]!
    }
    return playActs.sort((a, b) => scoreUnoAction(b, table, gs, playerIndex) - scoreUnoAction(a, table, gs, playerIndex))[0]!
  }
  if (passAfter.length === legals.length) return passAfter[0]!

  const draws = byCmd('unoDraw')
  if (draws.length === 1 && legals.length === 1) return draws[0]!

  const plays = legals.filter((a: CustomAction) => cmd(a.payload) === 'unoPlay')
  if (plays.length === 0) {
    return draws[0] ?? byCmd('unoPass')[0] ?? null
  }

  if (d === 'easy' && rng() < 0.4) {
    return plays[Math.floor(rng() * plays.length)]!
  }
  if (d === 'medium') {
    const nonWild = plays.filter((a) => {
      const ix = Number((a.payload as { index?: number }).index)
      const h = table.zones[handId(playerIndex)]!.cards[ix]
      return h && uc(tpl(table.templates, h.templateId)) !== 'w'
    })
    const pool = nonWild.length > 0 ? nonWild : plays
    return pool[Math.floor(rng() * pool.length)]!
  }

  if (d === 'hard' || d === 'expert') {
    if (d === 'expert' && rng() < 0.14) {
      const nonWild = plays.filter((a) => {
        const ix = Number((a.payload as { index?: number }).index)
        const h = table.zones[handId(playerIndex)]!.cards[ix]
        return h && uc(tpl(table.templates, h.templateId)) !== 'w'
      })
      if (
        nonWild.length > 0 &&
        plays.some((a) => {
          const ix = Number((a.payload as { index?: number }).index)
          return uc(tpl(table.templates, table.zones[handId(playerIndex)]!.cards[ix]!.templateId)) === 'w'
        }) &&
        rng() < 0.45
      ) {
        return nonWild[Math.floor(rng() * nonWild.length)]!
      }
    }
    const sorted = plays
      .map((a) => ({ a, s: scoreUnoAction(a, table, gs, playerIndex) }))
      .sort((x, y) => y.s - x.s)
    if (d === 'expert' && sorted.length > 1 && rng() < 0.11) return sorted[1]!.a
    return sorted[0]!.a
  }
  return plays[0]!
}
