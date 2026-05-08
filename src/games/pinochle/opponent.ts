import type { AiDifficulty } from '../../core/aiContext'
import type { SelectAiContext } from '../../core/gameModule'
import type { CardInstance, CardTemplate, GameAction } from '../../core/types'
import type { TableState } from '../../core/types'
import { handId, legalPlays, resolveTrick, trickPower } from './helpers'
import type { PinochleGameState } from './types'

function selectPinochleTrickIndex(
  templates: Record<string, CardTemplate>,
  gs: PinochleGameState,
  playerIndex: number,
  hand: CardInstance[],
  legalIdx: number[],
  rng: () => number,
  d: AiDifficulty,
): number {
  const trump = gs.trumpSuit
  const trick = gs.trick
  const leadSuit0 =
    trick.length > 0
      ? String(
          (templates[trick[0]!.templateId] as { suit?: string } | undefined)?.suit ?? '',
        )
      : ''

  if (legalIdx.length === 0) return 0
  if (legalIdx.length === 1) return legalIdx[0]!

  if (d === 'easy' && rng() < 0.38) {
    return legalIdx[Math.floor(rng() * legalIdx.length)]!
  }
  if (d === 'medium' && rng() < 0.22) {
    return legalIdx[Math.floor(rng() * legalIdx.length)]!
  }

  if (trick.length === 1) {
    const scored = legalIdx.map((i) => {
      const tid = hand[i]!.templateId
      const winner = resolveTrick(templates, [...trick, { player: playerIndex, templateId: tid }], trump)
      const p = trickPower(templates, tid, trump, leadSuit0)
      return { i, winner, p }
    })
    const weWin = scored.filter((x) => x.winner === playerIndex)
    if (weWin.length > 0) {
      const m = Math.min(...weWin.map((x) => x.p))
      const pool = weWin.filter((x) => x.p === m)
      if (d === 'expert' && weWin.length > 1 && rng() < 0.11) {
        const oth = [...weWin].sort((a, b) => a.p - b.p)
        if (oth[1]) return oth[1]!.i
      }
      return pool[Math.floor(rng() * pool.length)]!.i
    }
    return scored.sort((a, b) => a.p - b.p)[0]!.i
  }

  if (trick.length === 0) {
    if (d === 'medium' && rng() < 0.25) {
      return legalIdx[Math.floor(rng() * legalIdx.length)]!
    }
    const scored = legalIdx.map((i) => {
      const tid = hand[i]!.templateId
      const ls = String(templates[tid]?.suit ?? '')
      return { i, p: trickPower(templates, tid, trump, ls) }
    })
    const nts = scored.filter((s) => String(templates[hand[s.i]!.templateId]!.suit) !== trump)
    const use = nts.length > 0 ? nts : scored
    return use.sort((a, b) => a.p - b.p)[0]!.i
  }

  return legalIdx.sort(
    (a, b) =>
      trickPower(templates, hand[a]!.templateId, trump, leadSuit0) -
      trickPower(templates, hand[b]!.templateId, trump, leadSuit0),
  )[0]!
}

/** 2-player pinochle: heads-up trick logic (no partner feeding). */
export function pinochleSelectAiAction(
  table: TableState,
  gs: PinochleGameState,
  playerIndex: number,
  rng: () => number,
  context: SelectAiContext,
): GameAction | null {
  if (gs.phase !== 'play' || playerIndex !== gs.currentPlayer) return null
  const hand = table.zones[handId(playerIndex)]!.cards
  const idxs = legalPlays(table.templates, hand, gs.trick)
  if (!idxs.length) return null
  const i = selectPinochleTrickIndex(
    table.templates,
    gs,
    playerIndex,
    hand,
    idxs,
    rng,
    context.difficulty,
  )
  return { type: 'custom', payload: { cmd: 'pncPlay', index: i } }
}
