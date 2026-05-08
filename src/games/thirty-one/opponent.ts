import type { AiDifficulty } from '../../core/aiContext'
import type { SelectAiContext } from '../../core/gameModule'
import type { CardInstance, GameAction } from '../../core/types'
import type { TableState } from '../../core/types'
import { cmd, handId, handScore31, legalForSeat } from './helpers'
import type { ThirtyOneGameState } from './types'

/** Thirty-One AI: knock thresholds and one-step hand-value lookahead. */
export function thirtyOneSelectAiAction(
  table: TableState,
  gs: ThirtyOneGameState,
  playerIndex: number,
  rng: () => number,
  context: SelectAiContext,
): GameAction | null {
  if (gs.phase !== 'play' || playerIndex !== gs.currentPlayer) return null
  const d: AiDifficulty = context.difficulty
  const templates = table.templates
  const legal = legalForSeat(table, gs, playerIndex)
  const hz = table.zones[handId(playerIndex)]!.cards
  const myScore = handScore31(templates, hz)
  const canKnock = legal.some(
    (a) => a.type === 'custom' && cmd(a.payload as Record<string, unknown>) === 't31Knock',
  )

  if (canKnock) {
    let wantKnock = false
    if (d === 'easy') {
      if (myScore >= 30) wantKnock = true
      else if (myScore >= 28) wantKnock = rng() < 0.7
      else if (myScore >= 27) wantKnock = rng() < 0.4
      else if (myScore >= 25) wantKnock = rng() < 0.15
      if (wantKnock && rng() < 0.18) wantKnock = false
    } else if (d === 'medium') {
      wantKnock = myScore >= 28
      if (myScore >= 30) wantKnock = true
    } else if (d === 'hard') {
      wantKnock = myScore >= 27
      if (myScore >= 29) wantKnock = true
    } else {
      if (myScore >= 30) wantKnock = true
      else if (myScore >= 28) {
        wantKnock = rng() < 0.78
      } else if (myScore >= 27) {
        wantKnock = rng() < 0.35
      }
      if (d === 'expert' && myScore < 30 && myScore >= 27 && rng() < 0.12) {
        wantKnock = false
      }
    }
    if (wantKnock) return { type: 'custom', payload: { cmd: 't31Knock' } }
  }

  const nonKnock = legal.filter((a) => a.type === 'custom' && cmd(a.payload as Record<string, unknown>) !== 't31Knock')
  if (nonKnock.length === 0) {
    return { type: 'custom', payload: { cmd: 't31Knock' } }
  }

  if (d === 'easy') {
    return nonKnock[Math.floor(rng() * nonKnock.length)]!
  }
  if (d === 'medium') {
    if (rng() < 0.2) return nonKnock[Math.floor(rng() * nonKnock.length)]!
  }

  const topDisc = table.zones.discard?.cards[table.zones.discard!.cards.length - 1] ?? null
  const drawPile = table.zones.draw?.cards
  const topDraw = drawPile && drawPile.length > 0 ? drawPile[drawPile.length - 1]! : null

  const evalScoreAfter = (nextHand: CardInstance[]): number => handScore31(templates, nextHand)

  let best: GameAction = nonKnock[0]!
  let bestV = -1
  for (const a of nonKnock) {
    if (a.type !== 'custom') continue
    const c = cmd(a.payload as Record<string, unknown>)
    let v = -1
    if (c === 't31TakeDiscard' && topDisc) {
      const di = Number((a.payload as { discardIndex?: number }).discardIndex)
      if (!Number.isInteger(di) || di < 0 || di >= hz.length) continue
      const next = [...hz]
      next[di] = { ...topDisc, faceUp: true }
      v = evalScoreAfter(next)
    } else if (c === 't31DrawStock' && topDraw) {
      const di = Number((a.payload as { discardIndex?: number }).discardIndex)
      if (!Number.isInteger(di) || di < 0 || di >= hz.length) continue
      const next: CardInstance[] = hz.filter((_, j) => j !== di)
      next.push({ ...topDraw, faceUp: true })
      v = evalScoreAfter(next)
    }
    if (v > bestV) {
      bestV = v
      best = a
    }
  }
  if (d === 'medium' && bestV >= 0) {
    if (rng() < 0.55) return best
  }
  if (d === 'hard' && bestV >= 0) return best
  if (d === 'expert') {
    if (rng() < 0.09) return nonKnock[Math.floor(rng() * nonKnock.length)]!
    if (bestV >= 0) return best
  }
  return bestV >= 0 ? best : nonKnock[Math.floor(rng() * nonKnock.length)]!
}
