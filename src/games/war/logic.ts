import type { CardInstance } from '../../core/types'
import type { ApplyResult, GameModuleContext } from '../../core/gameModule'
import type { GameModule } from '../../core/gameModule'
import { mulberry32, shuffleCards } from '../../core/shuffle'
import { createEmptyTable, cloneTable } from '../../core/table'
import { dealEvenly, pileId, resolveSkirmish, totalPlayers } from './helpers'
import type { WarGameState } from './types'

export const warLogic: Pick<GameModule<WarGameState>, 'setup' | 'getLegalActions' | 'applyAction' | 'statusText'> = {
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

  statusText(_table, gs) {
    return gs.message
  },
}
