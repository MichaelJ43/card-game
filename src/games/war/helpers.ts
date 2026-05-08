import type { CardInstance, CardTemplate, GameManifestYaml } from '../../core/types'
import type { TableState } from '../../core/types'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'

const RANK_ORDER: Record<string, number> = {
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

export function rankValue(templates: Record<string, CardTemplate>, templateId: string): number {
  const t = templates[templateId]
  const r = t?.rank
  if (typeof r === 'string' && RANK_ORDER[r] !== undefined) return RANK_ORDER[r]
  return 0
}

export function pileId(i: number): string {
  return `pile:${i}`
}

export function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

export function dealEvenly(instances: CardInstance[], playerCount: number, table: TableState): void {
  instances.forEach((card, i) => {
    const p = i % playerCount
    const z = table.zones[pileId(p)]
    card.faceUp = false
    z.cards.push(card)
  })
}

/** Classic War for 2+ players: one face-up per player; ties trigger war (N down + 1 up). */
export function resolveSkirmish(
  table: TableState,
  templates: Record<string, CardTemplate>,
  playerCount: number,
  rng: () => number,
  tieDownCards: 1 | 3,
): { message: string } {
  const skirmish = table.zones.skirmish.cards
  skirmish.length = 0

  const piles = Array.from({ length: playerCount }, (_, i) => table.zones[pileId(i)]!.cards)

  const active = () =>
    piles
      .map((pile, idx) => ({ idx, n: pile.length }))
      .filter((x) => x.n > 0)
      .map((x) => x.idx)

  let participants = active()
  if (participants.length <= 1) {
    return { message: 'Waiting for opponent cards.' }
  }

  const takeSkirmishToWinner = (winnerIdx: number) => {
    const won = skirmish.splice(0, skirmish.length)
    shuffleInPlace(won, mulberry32(Math.floor(rng() * 0xffffffff)))
    for (const c of won) {
      c.faceUp = false
      piles[winnerIdx]!.unshift(c)
    }
  }

  const up: CardInstance[] = []
  for (const p of participants) {
    const c = piles[p]!.pop()!
    c.faceUp = true
    skirmish.push(c)
    up.push(c)
  }

  let max = -1
  for (const c of up) {
    max = Math.max(max, rankValue(templates, c.templateId))
  }
  let leaders = participants.filter((_p, i) => rankValue(templates, up[i]!.templateId) === max)
  if (leaders.length === 1) {
    takeSkirmishToWinner(leaders[0]!)
    return { message: `Player ${leaders[0]} wins the round.` }
  }

  let guard = 0
  while (leaders.length > 1 && guard++ < 500) {
    for (const p of leaders) {
      for (let k = 0; k < tieDownCards; k++) {
        if (piles[p]!.length === 0) break
        const c = piles[p]!.pop()!
        c.faceUp = false
        skirmish.push(c)
      }
    }
    const warUp: CardInstance[] = []
    const warPlayers: number[] = []
    for (const p of leaders) {
      if (piles[p]!.length === 0) continue
      const c = piles[p]!.pop()!
      c.faceUp = true
      skirmish.push(c)
      warUp.push(c)
      warPlayers.push(p)
    }

    if (warPlayers.length <= 1) {
      const still = active()
      if (still.length === 1 && skirmish.length > 0) {
        takeSkirmishToWinner(still[0]!)
        return { message: `Player ${still[0]} wins — others out of cards.` }
      }
      break
    }

    max = -1
    for (const c of warUp) {
      max = Math.max(max, rankValue(templates, c.templateId))
    }
    leaders = []
    for (let i = 0; i < warUp.length; i++) {
      if (rankValue(templates, warUp[i]!.templateId) === max) leaders.push(warPlayers[i]!)
    }
    if (leaders.length === 1) {
      takeSkirmishToWinner(leaders[0]!)
      return { message: `Player ${leaders[0]} wins the war.` }
    }
    participants = leaders
  }

  const alive = active()
  if (skirmish.length > 0 && alive.length === 1) {
    takeSkirmishToWinner(alive[0]!)
    return { message: `Player ${alive[0]} collects the remaining pile after war.` }
  }

  return { message: 'Stalemate — no clear winner for this skirmish.' }
}
