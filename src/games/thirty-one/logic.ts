import { recycleDiscardIntoDrawWhenEmpty } from '../../core/discardRecycle'
import type { ApplyResult, GameModule } from '../../core/gameModule'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveTop } from '../../core/table'
import { cmd, handId, handScore31, handZoneCount, legalForSeat, showdownScores, totalPlayers } from './helpers'
import type { ThirtyOneGameState } from './types'

export const thirtyOneLogic: Pick<
  GameModule<ThirtyOneGameState>,
  'setup' | 'getLegalActions' | 'applyAction' | 'statusText' | 'extractMatchRoundScores' | 'isMatchRoundFinished'
> = {
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
        reshuffleDiscardWhenDrawEmpty: ctx.reshuffleDiscardWhenDrawEmpty ?? false,
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
        recycleDiscardIntoDrawWhenEmpty(t, () => Math.random(), {
          enabled: gs.reshuffleDiscardWhenDrawEmpty,
          preserveTopDiscard: true,
        })
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
        recycleDiscardIntoDrawWhenEmpty(t, () => Math.random(), {
          enabled: gs.reshuffleDiscardWhenDrawEmpty,
          preserveTopDiscard: true,
        })
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
        recycleDiscardIntoDrawWhenEmpty(t, () => Math.random(), {
          enabled: gs.reshuffleDiscardWhenDrawEmpty,
          preserveTopDiscard: true,
        })
        if (t.zones.draw!.cards.length === 0) {
          const { winner } = showdownScores(t, pc)
          return finishRound(next, winner)
        }
        return { table: t, gameState: next }
      }
    }

    return { table: t, gameState: gs, error: 'Unknown action.' }
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
