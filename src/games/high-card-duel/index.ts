import type { ApplyResult, GameModule, GameModuleContext } from '../../core/gameModule'
import type { GameAction } from '../../core/types'
import { registerGameModule } from '../../core/registry'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveTop } from '../../core/table'
import { rankOrder } from '../standard/cardUtils'

function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

function stacksFrom(ctx: GameModuleContext, n: number): number[] {
  if (ctx.matchCumulativeScores?.length === n) return [...ctx.matchCumulativeScores]
  const v = ctx.manifest.match?.startingStack ?? 100
  return Array.from({ length: n }, () => (typeof v === 'number' && v > 0 ? v : 100))
}

export interface HighCardGameState {
  phase: 'bet' | 'done'
  stacks: [number, number]
  bet: number
  roundDelta: [number, number] | null
  message: string
}

const highCardModule: GameModule<HighCardGameState> = {
  moduleId: 'high-card-duel',

  setup(ctx, instances) {
    const rng = mulberry32(Math.floor(ctx.rng() * 0xffffffff))
    const table = createEmptyTable(ctx.templates, ['draw', 'hand:0', 'hand:1'], [
      { id: 'draw', kind: 'stack', defaultFaceUp: false },
      { id: 'hand:0', kind: 'spread', defaultFaceUp: true, owner: 0 },
      { id: 'hand:1', kind: 'spread', defaultFaceUp: true, owner: 1 },
    ])
    shuffleInPlace(instances, rng)
    for (const c of instances) table.zones.draw!.cards.push(c)
    const stacks = stacksFrom(ctx, 2) as [number, number]
    return {
      table,
      gameState: {
        phase: 'bet',
        stacks,
        bet: 5,
        roundDelta: null,
        message: 'Higher card wins the pot (aces high).',
      },
    }
  },

  getLegalActions(_table, gs) {
    if (gs.phase !== 'bet') return []
    const out: GameAction[] = []
    if (gs.stacks[0]! >= 5 && gs.stacks[1]! >= 5) {
      out.push({ type: 'custom', payload: { cmd: 'hcBet', amount: 5 } })
    }
    if (gs.stacks[0]! >= 10 && gs.stacks[1]! >= 10) {
      out.push({ type: 'custom', payload: { cmd: 'hcBet', amount: 10 } })
    }
    return out
  },

  applyAction(table, gs, action): ApplyResult<HighCardGameState> {
    const t = cloneTable(table)
    const templates = t.templates
    if (action.type !== 'custom' || cmd(action.payload) !== 'hcBet') {
      return { table: t, gameState: gs, error: 'Bet to duel.' }
    }
    const b = Number((action.payload as { amount?: number }).amount)
    if (b !== 5 && b !== 10) return { table: t, gameState: gs, error: 'Bad bet.' }
    if (gs.stacks[0]! < b || gs.stacks[1]! < b) return { table: t, gameState: gs, error: 'Not enough chips.' }
    t.zones['hand:0']!.cards.length = 0
    t.zones['hand:1']!.cards.length = 0
    moveTop(t, 'draw', 'hand:0', true)
    moveTop(t, 'draw', 'hand:1', true)
    const p0 = t.zones['hand:0']!.cards[0]!.templateId
    const p1 = t.zones['hand:1']!.cards[0]!.templateId
    const v0 = rankOrder(templates, p0)
    const v1 = rankOrder(templates, p1)
    const base0 = gs.stacks[0]! - b
    const base1 = gs.stacks[1]! - b
    const pre0 = gs.stacks[0]!
    const pre1 = gs.stacks[1]!
    let s0 = base0
    let s1 = base1
    let message = ''
    if (v0 > v1) {
      s0 = base0 + 2 * b
      s1 = base1
      message = 'You win.'
    } else if (v1 > v0) {
      s0 = base0
      s1 = base1 + 2 * b
      message = 'Opponent wins.'
    } else {
      s0 = pre0
      s1 = pre1
      message = 'Tie — push.'
    }
    return {
      table: t,
      gameState: {
        phase: 'done',
        stacks: [s0, s1],
        bet: b,
        roundDelta: [s0 - pre0, s1 - pre1],
        message,
      },
    }
  },

  selectAiAction(): GameAction | null {
    return null
  },

  statusText(_t, gs) {
    return gs.message
  },

  extractMatchRoundScores(gs) {
    return gs.phase === 'done' && gs.roundDelta ? [...gs.roundDelta] : null
  },

  isMatchRoundFinished(gs) {
    return gs.phase === 'done' && gs.roundDelta !== null
  },
}

registerGameModule(highCardModule)
