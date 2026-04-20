import type { CardInstance, GameManifestYaml } from '../../core/types'
import type { CardTemplate } from '../../core/types'
import type { ApplyResult, GameModule, GameModuleContext, SelectAiContext } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { mulberry32, shuffleCards, shuffleInPlace } from '../../core/shuffle'
import { createEmptyTable, cloneTable } from '../../core/table'
import type { TableState } from '../../core/types'

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

function rankValue(templates: Record<string, CardTemplate>, templateId: string): number {
  const t = templates[templateId]
  const r = t?.rank
  if (typeof r === 'string' && RANK_ORDER[r] !== undefined) return RANK_ORDER[r]
  return 0
}

function pileId(i: number): string {
  return `pile:${i}`
}

function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

function dealEvenly(instances: CardInstance[], playerCount: number, table: TableState): void {
  instances.forEach((card, i) => {
    const p = i % playerCount
    const z = table.zones[pileId(p)]
    card.faceUp = false
    z.cards.push(card)
  })
}

export interface WarGameState {
  phase: 'playing' | 'over'
  winnerIndex: number | null
  message: string
  playerCount: number
  /** Face-down cards each player puts out before the tie-break flip (1 quick, 3 classic). */
  tieDownCards: 1 | 3
}

/** Classic War for 2+ players: one face-up per player; ties trigger war (N down + 1 up). */
function resolveSkirmish(
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

  // First flip
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

  // War among tied leaders only (classroom rule)
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

const warModule: GameModule<WarGameState> = {
  moduleId: 'war',

  setup(ctx: GameModuleContext, instances: CardInstance[]) {
    const { manifest, templates, rng } = ctx
    const rawTie = ctx.warTieDownCards
    const tieDownCards: 1 | 3 = rawTie === 1 ? 1 : 3
    const pCount = totalPlayers(manifest)
    const zoneIds = [...Array.from({ length: pCount }, (_, i) => pileId(i)), 'skirmish']
    const table = createEmptyTable(templates, zoneIds, [
      ...Array.from({ length: pCount }, (_, i) => ({
        id: pileId(i),
        kind: 'stack' as const,
        defaultFaceUp: false,
        owner: i,
      })),
      { id: 'skirmish', kind: 'spread', defaultFaceUp: true },
    ])

    const shuffled = shuffleCards(instances, { seed: Math.floor(rng() * 0xffffffff) })
    dealEvenly(shuffled, pCount, table)

    return {
      table,
      gameState: {
        phase: 'playing',
        winnerIndex: null,
        message: 'Click “Play round” to battle.',
        playerCount: pCount,
        tieDownCards,
      },
    }
  },

  getLegalActions(_table, gameState) {
    if (gameState.phase === 'over') return []
    return [{ type: 'step' }]
  },

  applyAction(table, gameState, action): ApplyResult<WarGameState> {
    if (action.type !== 'step') {
      return { table, gameState, error: 'Only step is supported.' }
    }
    if (gameState.phase === 'over') {
      return { table, gameState, error: 'Game is over.' }
    }

    const t = cloneTable(table)
    const pCount = gameState.playerCount

    const rng = mulberry32(Math.floor(Math.random() * 0xffffffff))
    const result = resolveSkirmish(t, t.templates, pCount, rng, gameState.tieDownCards)
    let message = result.message
    let winnerIndex = gameState.winnerIndex
    let phase: WarGameState['phase'] = 'playing'

    const counts = Array.from({ length: pCount }, (_, i) => t.zones[pileId(i)]!.cards.length)
    const nonempty = counts.filter((n) => n > 0).length
    if (nonempty <= 1) {
      phase = 'over'
      const champ = counts.findIndex((n) => n > 0)
      winnerIndex = champ >= 0 ? champ : null
      message = `Game over. Winner: Player ${winnerIndex ?? '?'}.`
    }

    return {
      table: t,
      gameState: {
        phase,
        winnerIndex,
        message,
        playerCount: pCount,
        tieDownCards: gameState.tieDownCards,
      },
    }
  },

  selectAiAction(_table, _gameState, _playerIndex, _rng, _context: SelectAiContext) {
    return null
  },

  statusText(_table, gs) {
    return gs.message
  },
}

registerGameModule(warModule)
