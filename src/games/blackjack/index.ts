import type { ApplyResult, GameModule, GameModuleContext } from '../../core/gameModule'
import type { CardInstance, CardTemplate, GameAction, GameManifestYaml } from '../../core/types'
import { registerGameModule } from '../../core/registry'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveTop } from '../../core/table'
import type { TableState } from '../../core/types'
import { blackjackValue, isBlackjack } from '../standard/cardUtils'

function cmd(payload: Record<string, unknown> | undefined): string {
  return typeof payload?.cmd === 'string' ? payload.cmd : ''
}

function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

export interface BlackjackGameState {
  phase: 'bet' | 'play' | 'doneRound'
  stacks: [number, number]
  bet: number
  roundDelta: [number, number] | null
  message: string
}

function startingStacks(ctx: GameModuleContext, pCount: number): number[] {
  const fromMatch = ctx.matchCumulativeScores
  if (fromMatch && fromMatch.length === pCount) return [...fromMatch]
  const s = ctx.manifest.match?.startingStack
  const v = typeof s === 'number' && s > 0 ? s : 100
  return Array.from({ length: pCount }, () => v)
}

function dealInitial(table: TableState, pCount: number): void {
  for (let r = 0; r < 2; r++) {
    for (let p = 0; p < pCount; p++) {
      const c = moveTop(table, 'draw', `hand:${p}`, p === 0)
      if (c) c.faceUp = p === 0 || (p === 1 && r === 1)
    }
  }
}

function dealerPlay(table: TableState, templates: Record<string, CardTemplate>): void {
  const h = table.zones['hand:1']!.cards
  for (const c of h) c.faceUp = true
  while (blackjackValue(templates, h.map((c) => c.templateId)) < 17 && table.zones.draw!.cards.length > 0) {
    moveTop(table, 'draw', 'hand:1', true)
  }
}

const blackjackModule: GameModule<BlackjackGameState> = {
  moduleId: 'blackjack',

  setup(ctx: GameModuleContext, instances: CardInstance[]) {
    const pCount = totalPlayers(ctx.manifest)
    if (pCount !== 2) throw new Error('Blackjack module expects exactly 2 players (you + dealer).')
    const rng = mulberry32(Math.floor(ctx.rng() * 0xffffffff))
    const zoneIds = ['draw', 'hand:0', 'hand:1']
    const table = createEmptyTable(ctx.templates, zoneIds, [
      { id: 'draw', kind: 'stack', defaultFaceUp: false },
      { id: 'hand:0', kind: 'spread', defaultFaceUp: true, owner: 0 },
      { id: 'hand:1', kind: 'spread', defaultFaceUp: true, owner: 1 },
    ])
    shuffleInPlace(instances, rng)
    for (const c of instances) {
      c.faceUp = false
      table.zones.draw!.cards.push(c)
    }
    const stacks = startingStacks(ctx, 2) as [number, number]
    return {
      table,
      gameState: {
        phase: 'bet',
        stacks,
        bet: 0,
        roundDelta: null,
        message: 'Place a bet (chips). Min 1, max 25 or your stack.',
      },
    }
  },

  getLegalActions(table, gs): GameAction[] {
    if (gs.phase === 'doneRound') return []
    if (gs.phase === 'bet') {
      const maxBet = Math.min(25, gs.stacks[0] ?? 0, gs.stacks[1] ?? 0)
      const out: GameAction[] = []
      for (const a of [1, 5, 10, 25]) {
        if (a <= maxBet) out.push({ type: 'custom', payload: { cmd: 'bjBet', amount: a } })
      }
      return out
    }
    const p = table.zones['hand:0']!.cards.map((c) => c.templateId)
    const v = blackjackValue(table.templates, p)
    const acts: GameAction[] = [{ type: 'custom', payload: { cmd: 'bjStand' } }]
    if (v < 21 && table.zones.draw!.cards.length > 0) {
      acts.unshift({ type: 'custom', payload: { cmd: 'bjHit' } })
    }
    return acts
  },

  applyAction(table, gameState, action): ApplyResult<BlackjackGameState> {
    const t = cloneTable(table)
    const templates = t.templates
    const gs = gameState
    const pl = t.zones['hand:0']!.cards
    const dl = t.zones['hand:1']!.cards

    if (action.type !== 'custom') return { table: t, gameState: gs, error: 'Unsupported action.' }
    const c = cmd(action.payload)

    if (gs.phase === 'doneRound') {
      return { table: t, gameState: gs, error: 'Hand finished — use Next round.' }
    }

    if (gs.phase === 'bet') {
      if (c !== 'bjBet') return { table: t, gameState: gs, error: 'Place a bet first.' }
      const amount = Number((action.payload as { amount?: number })?.amount)
      if (!Number.isFinite(amount) || amount < 1) return { table: t, gameState: gs, error: 'Invalid bet.' }
      if (amount > gs.stacks[0]! || amount > gs.stacks[1]!) {
        return { table: t, gameState: gs, error: 'Not enough chips.' }
      }
      pl.length = 0
      dl.length = 0
      dealInitial(t, 2)
      const bet = amount
      let message = 'Your turn — hit or stand.'
      let phase: BlackjackGameState['phase'] = 'play'
      let roundDelta: [number, number] | null = null

      const pids = pl.map((c) => c.templateId)
      const dids = dl.map((c) => c.templateId)
      if (isBlackjack(templates, pids) || isBlackjack(templates, dids)) {
        for (const c of dl) c.faceUp = true
        const pb = isBlackjack(templates, pids)
        const db = isBlackjack(templates, dids)
        let d0 = 0
        let d1 = 0
        if (pb && db) {
          message = 'Both blackjack — push.'
          d0 = 0
          d1 = 0
        } else if (pb) {
          message = 'Blackjack! You win 3:2 on this bet.'
          d0 = Math.floor(bet * 1.5)
          d1 = -d0
        } else {
          message = 'Dealer blackjack.'
          d0 = -bet
          d1 = bet
        }
        const s0 = gs.stacks[0]! + d0
        const s1 = gs.stacks[1]! + d1
        roundDelta = [d0, d1]
        phase = 'doneRound'
        return {
          table: t,
          gameState: {
            phase,
            stacks: [s0, s1],
            bet,
            roundDelta,
            message,
          },
        }
      }

      return {
        table: t,
        gameState: {
          phase,
          stacks: gs.stacks,
          bet,
          roundDelta,
          message,
        },
      }
    }

    if (gs.phase === 'play') {
      if (c === 'bjHit') {
        if (blackjackValue(templates, pl.map((x) => x.templateId)) >= 21) {
          return { table: t, gameState: gs, error: 'Cannot hit.' }
        }
        moveTop(t, 'draw', 'hand:0', true)
        const nv = blackjackValue(templates, pl.map((x) => x.templateId))
        if (nv > 21) {
          for (const c of dl) c.faceUp = true
          const d0 = -gs.bet
          const d1 = gs.bet
          return {
            table: t,
            gameState: {
              phase: 'doneRound',
              stacks: [gs.stacks[0]! + d0, gs.stacks[1]! + d1],
              bet: gs.bet,
              roundDelta: [d0, d1],
              message: 'Bust — dealer wins.',
            },
          }
        }
        return {
          table: t,
          gameState: { ...gs, message: 'Hit or stand.' },
        }
      }
      if (c === 'bjStand') {
        dealerPlay(t, templates)
        const pv = blackjackValue(templates, pl.map((x) => x.templateId))
        const dv = blackjackValue(templates, dl.map((x) => x.templateId))
        let d0 = 0
        let d1 = 0
        let message = ''
        if (dv > 21) {
          message = 'Dealer busts — you win.'
          d0 = gs.bet
          d1 = -gs.bet
        } else if (pv > dv) {
          message = 'You win.'
          d0 = gs.bet
          d1 = -gs.bet
        } else if (pv < dv) {
          message = 'Dealer wins.'
          d0 = -gs.bet
          d1 = gs.bet
        } else {
          message = 'Push.'
          d0 = 0
          d1 = 0
        }
        return {
          table: t,
          gameState: {
            phase: 'doneRound',
            stacks: [gs.stacks[0]! + d0, gs.stacks[1]! + d1],
            bet: gs.bet,
            roundDelta: [d0, d1],
            message,
          },
        }
      }
    }

    return { table: t, gameState: gs, error: 'Unknown action.' }
  },

  selectAiAction(): GameAction | null {
    return null
  },

  statusText(_table, gs) {
    return gs.message
  },

  extractMatchRoundScores(gs) {
    return gs.phase === 'doneRound' && gs.roundDelta ? [...gs.roundDelta] : null
  },

  isMatchRoundFinished(gs) {
    return gs.phase === 'doneRound' && gs.roundDelta !== null
  },
}

registerGameModule(blackjackModule)
