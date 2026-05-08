import type { CardInstance } from '../../core/types'
import type { ApplyResult, GameModuleContext } from '../../core/gameModule'
import type { GameModule } from '../../core/gameModule'
import { shuffleCards } from '../../core/shuffle'
import { createEmptyTable, cloneTable, moveTop } from '../../core/table'
import { cardValue, totalPlayers } from './helpers'
import type { DemoCustomState } from './types'

export const demoLogic: Pick<
  GameModule<DemoCustomState>,
  'setup' | 'getLegalActions' | 'applyAction' | 'statusText'
> = {
  setup(ctx: GameModuleContext, instances: CardInstance[]) {
    const { manifest, templates, rng } = ctx
    const pCount = totalPlayers(manifest)
    const zoneIds = ['stock', ...Array.from({ length: pCount }, (_, i) => `show:${i}`)]
    const table = createEmptyTable(templates, zoneIds, [
      { id: 'stock', kind: 'stack', defaultFaceUp: false },
      ...Array.from({ length: pCount }, (_, i) => ({
        id: `show:${i}`,
        kind: 'spread' as const,
        defaultFaceUp: true,
        owner: i,
      })),
    ])

    const shuffled = shuffleCards(instances, { seed: Math.floor(rng() * 0xffffffff) })
    for (const c of shuffled) {
      c.faceUp = false
      table.zones.stock!.cards.push(c)
    }

    for (let i = 0; i < pCount; i++) {
      moveTop(table, 'stock', `show:${i}`, true)
    }

    return {
      table,
      gameState: {
        phase: 'ready',
        message: 'Each player drew one card from the custom deck. Click “Reveal winner”.',
        playerCount: pCount,
      },
    }
  },

  getLegalActions(_table, gameState) {
    if (gameState.phase === 'over') return []
    return [{ type: 'step' }]
  },

  applyAction(table, gameState, action): ApplyResult<DemoCustomState> {
    if (action.type !== 'step') {
      return { table, gameState, error: 'Unsupported action.' }
    }
    if (gameState.phase === 'over') {
      return { table, gameState, error: 'Already resolved.' }
    }

    const t = cloneTable(table)
    const pCount = gameState.playerCount
    let best = -Infinity
    let leaders: number[] = []
    for (let i = 0; i < pCount; i++) {
      const z = t.zones[`show:${i}`]!
      const top = z.cards[z.cards.length - 1]
      if (!top) continue
      const v = cardValue(t.templates, top.templateId)
      if (v > best) {
        best = v
        leaders = [i]
      } else if (v === best) {
        leaders.push(i)
      }
    }

    const msg =
      leaders.length === 0
        ? 'No cards.'
        : leaders.length === 1
          ? `Player ${leaders[0]} wins with value ${best}.`
          : `Tie on value ${best} between players ${leaders.join(', ')}.`

    return {
      table: t,
      gameState: {
        phase: 'over',
        message: msg,
        playerCount: pCount,
      },
    }
  },

  statusText(_table, gs) {
    return gs.message
  },
}
