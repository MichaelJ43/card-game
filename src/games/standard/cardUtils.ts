import type { CardTemplate } from '../../core/types'

const RANK_VAL: Record<string, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
}

export function rankOrder(templates: Record<string, CardTemplate>, templateId: string): number {
  const r = templates[templateId]?.rank
  return typeof r === 'string' && RANK_VAL[r] !== undefined ? RANK_VAL[r]! : 0
}

/** Best blackjack total ≤ 21 (Aces 1 or 11). */
export function blackjackValue(templates: Record<string, CardTemplate>, templateIds: string[]): number {
  let low = 0
  let aces = 0
  for (const id of templateIds) {
    const r = templates[id]?.rank
    if (r === 'A') {
      aces++
      low += 1
    } else if (typeof r === 'string' && RANK_VAL[r] !== undefined) {
      const v = RANK_VAL[r]!
      low += v >= 10 ? 10 : v
    }
  }
  let best = low
  for (let k = 0; k < aces; k++) {
    const with11 = best + 10
    if (with11 <= 21) best = with11
  }
  return best
}

export function isBlackjack(templates: Record<string, CardTemplate>, twoIds: string[]): boolean {
  if (twoIds.length !== 2) return false
  return blackjackValue(templates, twoIds) === 21
}
