import type { CardInstance, GameManifestYaml } from '../../core/types'
import type { ApplyResult, GameModule, GameModuleContext, SelectAiContext } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { shuffleCards } from '../../core/shuffle'
import { createEmptyTable, cloneTable, moveTop } from '../../core/table'
import type { CardTemplate } from '../../core/types'

function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

function cardValue(templates: Record<string, CardTemplate>, templateId: string): number {
  const v = templates[templateId]?.value
  return typeof v === 'number' ? v : 0
}

export interface DemoCustomState {
  phase: 'ready' | 'over'
  message: string
  playerCount: number
}

const demoCustomModule: GameModule<DemoCustomState> = {
  moduleId: 'demo-custom',

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

  selectAiAction(_table, _gameState, _playerIndex, _rng, _context: SelectAiContext) {
    return null
  },

  statusText(_table, gs) {
    return gs.message
  },
}

registerGameModule(demoCustomModule)
