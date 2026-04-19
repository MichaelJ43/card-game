import type { ApplyResult, GameModule, GameModuleContext } from '../../core/gameModule'
import type { CardTemplate, GameAction } from '../../core/types'
import { registerGameModule } from '../../core/registry'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveTop } from '../../core/table'
function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

function baccaratValue(templates: Record<string, CardTemplate>, ids: string[]): number {
  let s = 0
  for (const id of ids) {
    const r = templates[id]?.rank
    if (r === 'A') s += 1
    else if (r === '10' || r === 'J' || r === 'Q' || r === 'K') s += 0
    else if (r === '2' || r === '3' || r === '4' || r === '5' || r === '6' || r === '7' || r === '8' || r === '9') {
      s += Number(r)
    }
  }
  return s % 10
}

function startingStacks(ctx: GameModuleContext, n: number): number[] {
  if (ctx.matchCumulativeScores && ctx.matchCumulativeScores.length === n) return [...ctx.matchCumulativeScores]
  const v = ctx.manifest.match?.startingStack ?? 100
  return Array.from({ length: n }, () => (typeof v === 'number' && v > 0 ? v : 100))
}

export interface BaccaratGameState {
  phase: 'bet' | 'done'
  stacks: [number, number]
  bet: number
  side: 'player' | 'banker' | null
  roundDelta: [number, number] | null
  message: string
}

const baccaratModule: GameModule<BaccaratGameState> = {
  moduleId: 'baccarat',

  setup(ctx, instances) {
    const rng = mulberry32(Math.floor(ctx.rng() * 0xffffffff))
    const table = createEmptyTable(ctx.templates, ['draw', 'hand:0', 'hand:1'], [
      { id: 'draw', kind: 'stack', defaultFaceUp: false },
      { id: 'hand:0', kind: 'spread', defaultFaceUp: true, owner: 0 },
      { id: 'hand:1', kind: 'spread', defaultFaceUp: true, owner: 1 },
    ])
    shuffleInPlace(instances, rng)
    for (const c of instances) table.zones.draw!.cards.push(c)
    const stacks = startingStacks(ctx, 2) as [number, number]
    return {
      table,
      gameState: {
        phase: 'bet',
        stacks,
        bet: 0,
        side: null,
        roundDelta: null,
        message: 'Bet on Player (you) or Banker — same odds, 5% commission on banker wins not simulated.',
      },
    }
  },

  getLegalActions(_table, gs) {
    if (gs.phase !== 'bet') return []
    const max = Math.min(25, gs.stacks[0]!, gs.stacks[1]!)
    const out: GameAction[] = []
    for (const a of [1, 5, 10, 25]) {
      if (a <= max) {
        out.push({ type: 'custom', payload: { cmd: 'bacBet', amount: a, side: 'player' } })
        out.push({ type: 'custom', payload: { cmd: 'bacBet', amount: a, side: 'banker' } })
      }
    }
    return out
  },

  applyAction(table, gs, action): ApplyResult<BaccaratGameState> {
    const t = cloneTable(table)
    const templates = t.templates
    if (action.type !== 'custom') return { table: t, gameState: gs, error: 'Unsupported.' }
    if (gs.phase !== 'bet' || cmd(action.payload) !== 'bacBet') {
      return { table: t, gameState: gs, error: 'Bet first.' }
    }
    const amount = Number((action.payload as { amount?: number }).amount)
    const side = (action.payload as { side?: string }).side
    if (!Number.isFinite(amount) || amount < 1) return { table: t, gameState: gs, error: 'Bad amount.' }
    if (side !== 'player' && side !== 'banker') return { table: t, gameState: gs, error: 'Pick side.' }
    if (amount > gs.stacks[0]! || amount > gs.stacks[1]!) return { table: t, gameState: gs, error: 'Not enough chips.' }

    t.zones['hand:0']!.cards.length = 0
    t.zones['hand:1']!.cards.length = 0
    for (let i = 0; i < 2; i++) {
      moveTop(t, 'draw', 'hand:0', true)
      moveTop(t, 'draw', 'hand:1', true)
    }
    const pv = baccaratValue(templates, t.zones['hand:0']!.cards.map((c) => c.templateId))
    const bv = baccaratValue(templates, t.zones['hand:1']!.cards.map((c) => c.templateId))
    let d0 = 0
    let d1 = 0
    let message = ''
    if (pv > bv) {
      if (side === 'player') {
        d0 = amount
        d1 = -amount
        message = `Player ${pv} beats Banker ${bv}. You win.`
      } else {
        d0 = -amount
        d1 = amount
        message = `Player ${pv} beats Banker ${bv}. You bet Banker — lose.`
      }
    } else if (bv > pv) {
      if (side === 'banker') {
        d0 = amount
        d1 = -amount
        message = `Banker ${bv} beats Player ${pv}. You win.`
      } else {
        d0 = -amount
        d1 = amount
        message = `Banker wins. You lose.`
      }
    } else {
      message = `Tie at ${pv}. Push.`
      d0 = 0
      d1 = 0
    }
    return {
      table: t,
      gameState: {
        phase: 'done',
        stacks: [gs.stacks[0]! + d0, gs.stacks[1]! + d1],
        bet: amount,
        side: side as 'player' | 'banker',
        roundDelta: [d0, d1],
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

registerGameModule(baccaratModule)
