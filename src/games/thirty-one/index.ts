import type { ApplyResult, GameModule, SelectAiContext } from '../../core/gameModule'
import type { CardInstance, CardTemplate, GameAction, GameManifestYaml } from '../../core/types'
import { registerGameModule } from '../../core/registry'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveTop } from '../../core/table'
import type { TableState } from '../../core/types'

function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

function handZoneCount(table: TableState): number {
  return Object.keys(table.zones).filter((id) => /^hand:\d+$/.test(id)).length
}

function handId(i: number): string {
  return `hand:${i}`
}

function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

function pipValue(rank: string | undefined): number {
  if (rank === 'A') return 11
  if (rank === 'K' || rank === 'Q' || rank === 'J' || rank === '10') return 10
  const n = Number(rank)
  return Number.isFinite(n) ? n : 0
}

function handScore31(templates: Record<string, CardTemplate>, hand: CardInstance[]): number {
  const bySuit = new Map<string, number>()
  for (const c of hand) {
    const t = templates[c.templateId]
    const suit = typeof t?.suit === 'string' ? t.suit : 'x'
    const r = typeof t?.rank === 'string' ? t.rank : ''
    bySuit.set(suit, (bySuit.get(suit) ?? 0) + pipValue(r))
  }
  let best = 0
  for (const v of bySuit.values()) {
    if (v <= 31) best = Math.max(best, v)
  }
  return best
}

function showdownScores(table: TableState, pc: number): { winner: number } {
  const scores: number[] = []
  for (let i = 0; i < pc; i++) {
    scores.push(handScore31(table.templates, table.zones[handId(i)]!.cards))
  }
  let winner = 0
  for (let i = 1; i < pc; i++) {
    if (scores[i]! > scores[winner]!) winner = i
  }
  return { winner }
}

function legalForSeat(table: TableState, gs: ThirtyOneGameState, cur: number): GameAction[] {
  if (gs.phase !== 'play' || cur !== gs.currentPlayer) return []
  const hz = table.zones[handId(cur)]!.cards
  if (hz.length !== 3) return []
  const out: GameAction[] = []
  out.push({ type: 'custom', payload: { cmd: 't31Knock' } })
  if (table.zones.draw!.cards.length > 0) {
    for (let i = 0; i < hz.length; i++) {
      out.push({ type: 'custom', payload: { cmd: 't31DrawStock', discardIndex: i } })
    }
  }
  const disc = table.zones.discard!.cards
  if (disc.length > 0) {
    for (let i = 0; i < hz.length; i++) {
      out.push({ type: 'custom', payload: { cmd: 't31TakeDiscard', discardIndex: i } })
    }
  }
  return out
}

export interface ThirtyOneGameState {
  phase: 'play' | 'done'
  currentPlayer: number
  message: string
  roundScores: number[] | null
}

const thirtyOneModule: GameModule<ThirtyOneGameState> = {
  moduleId: 'thirty-one',

  setup(ctx, instances) {
    const pCount = totalPlayers(ctx.manifest)
    if (pCount !== 2) throw new Error('Thirty-One is implemented for 2 players.')
    const rng = mulberry32(Math.floor(ctx.rng() * 0xffffffff))
    const zoneIds = ['draw', 'discard', ...Array.from({ length: pCount }, (_, i) => handId(i))]
    const table = createEmptyTable(ctx.templates, zoneIds, [
      { id: 'draw', kind: 'stack', defaultFaceUp: false },
      { id: 'discard', kind: 'stack', defaultFaceUp: true },
      ...Array.from({ length: pCount }, (_, i) => ({
        id: handId(i),
        kind: 'spread' as const,
        defaultFaceUp: false,
        owner: i,
      })),
    ])
    shuffleInPlace(instances, rng)
    for (const c of instances) {
      c.faceUp = false
      table.zones.draw!.cards.push(c)
    }
    for (let r = 0; r < 3; r++) {
      for (let p = 0; p < pCount; p++) {
        const c = moveTop(table, 'draw', handId(p), p === 0)
        if (c) c.faceUp = p === 0
      }
    }
    moveTop(table, 'draw', 'discard', true)
    return {
      table,
      gameState: {
        phase: 'play',
        currentPlayer: 0,
        message: 'Draw or take discard, then discard. Knock to end the round now.',
        roundScores: null,
      },
    }
  },

  getLegalActions(table, gs) {
    return legalForSeat(table, gs, 0)
  },

  applyAction(table, gs, action) {
    const t = cloneTable(table)
    const pc = handZoneCount(t)

    const finishRound = (next: ThirtyOneGameState, winner: number): ApplyResult<ThirtyOneGameState> => {
      const rs = Array.from({ length: pc }, () => 0)
      rs[winner] = 1
      return {
        table: t,
        gameState: {
          ...next,
          phase: 'done',
          message: `Round over — Player ${winner + 1} wins the point (best ≤31: ${handScore31(t.templates, t.zones[handId(winner)]!.cards)}).`,
          roundScores: rs,
        },
      }
    }

    if (action.type === 'custom') {
      const c = cmd(action.payload)
      if (gs.phase !== 'play') return { table: t, gameState: gs, error: 'Round is over.' }
      const cur = gs.currentPlayer
      const hz = t.zones[handId(cur)]!.cards

      if (c === 't31Knock') {
        if (hz.length !== 3) return { table: t, gameState: gs, error: 'Knock with exactly 3 cards.' }
        const { winner } = showdownScores(t, pc)
        return finishRound(gs, winner)
      }

      if (c === 't31DrawStock') {
        const di = Number((action.payload as { discardIndex?: unknown }).discardIndex)
        if (!Number.isInteger(di) || di < 0 || di >= hz.length) return { table: t, gameState: gs, error: 'Bad discard index.' }
        if (t.zones.draw!.cards.length === 0) return { table: t, gameState: gs, error: 'Deck empty.' }
        const drawn = moveTop(t, 'draw', handId(cur), cur === 0)
        if (!drawn) return { table: t, gameState: gs, error: 'Draw failed.' }
        drawn.faceUp = cur === 0
        const discard = hz.splice(di, 1)[0]!
        discard.faceUp = true
        t.zones.discard!.cards.push(discard)
        const next: ThirtyOneGameState = {
          ...gs,
          currentPlayer: (cur + 1) % pc,
          message: 'Next player’s turn.',
        }
        if (t.zones.draw!.cards.length === 0) {
          const { winner } = showdownScores(t, pc)
          return finishRound(next, winner)
        }
        return { table: t, gameState: next }
      }

      if (c === 't31TakeDiscard') {
        const di = Number((action.payload as { discardIndex?: unknown }).discardIndex)
        if (!Number.isInteger(di) || di < 0 || di >= hz.length) return { table: t, gameState: gs, error: 'Bad discard index.' }
        if (t.zones.discard!.cards.length === 0) return { table: t, gameState: gs, error: 'No discard to take.' }
        const top = t.zones.discard!.cards.pop()!
        top.faceUp = cur === 0
        hz.push(top)
        const discard = hz.splice(di, 1)[0]!
        discard.faceUp = true
        t.zones.discard!.cards.push(discard)
        const next: ThirtyOneGameState = {
          ...gs,
          currentPlayer: (cur + 1) % pc,
          message: 'Next player’s turn.',
        }
        if (t.zones.draw!.cards.length === 0) {
          const { winner } = showdownScores(t, pc)
          return finishRound(next, winner)
        }
        return { table: t, gameState: next }
      }
    }

    return { table: t, gameState: gs, error: 'Unknown action.' }
  },

  selectAiAction(table, gs, playerIndex, rng, context: SelectAiContext) {
    void context
    if (gs.phase !== 'play' || playerIndex !== gs.currentPlayer) return null
    const legal = legalForSeat(table, gs, playerIndex)
    const hz = table.zones[handId(playerIndex)]!.cards
    const score = handScore31(table.templates, hz)
    if (score >= 28 && legal.some((a) => a.type === 'custom' && cmd(a.payload as Record<string, unknown>) === 't31Knock')) {
      return { type: 'custom', payload: { cmd: 't31Knock' } }
    }
    const acts = legal.filter((a) => a.type === 'custom')
    if (!acts.length) return null
    return acts[Math.floor(rng() * acts.length)]!
  },

  statusText(table, gs) {
    if (gs.phase === 'done') return gs.message
    const s = handScore31(table.templates, table.zones['hand:0']!.cards)
    return `${gs.message} Your best single-suit total ≤31: ${s}. Player ${gs.currentPlayer + 1}’s turn.`
  },

  extractMatchRoundScores(gs) {
    return gs.roundScores
  },

  isMatchRoundFinished(gs) {
    return gs.phase === 'done' && gs.roundScores !== null
  },
}

registerGameModule(thirtyOneModule)
