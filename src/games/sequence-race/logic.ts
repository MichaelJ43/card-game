import type { ApplyResult, GameModule } from '../../core/gameModule'
import type { GameAction } from '../../core/types'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveTop } from '../../core/table'
import {
  advancePile,
  canPlayOnPile,
  cardValue,
  cmd,
  drawToFive,
  handId,
  legalPlays,
  totalPlayers,
} from './helpers'
import type { SequenceRaceGameState } from './types'

export const sequenceRaceLogic: Pick<
  GameModule<SequenceRaceGameState>,
  'setup' | 'getLegalActions' | 'applyAction' | 'statusText' | 'extractMatchRoundScores' | 'isMatchRoundFinished'
> = {
  setup(ctx, instances) {
    const pCount = totalPlayers(ctx.manifest)
    if (pCount !== 2) throw new Error('Sequence race is 2-player only.')
    const rng = mulberry32(Math.floor(ctx.rng() * 0xffffffff))
    const zoneIds = ['draw', 'waste', ...Array.from({ length: pCount }, (_, i) => handId(i))]
    const table = createEmptyTable(ctx.templates, zoneIds, [
      { id: 'draw', kind: 'stack', defaultFaceUp: false },
      { id: 'waste', kind: 'stack', defaultFaceUp: true },
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
    for (let p = 0; p < pCount; p++) {
      for (let r = 0; r < 5; r++) {
        const c = moveTop(table, 'draw', handId(p), p === 0)
        if (c) c.faceUp = p === 0
      }
    }

    return {
      table,
      gameState: {
        phase: 'play',
        currentPlayer: 0,
        piles: [1, 1, 1, 1],
        message:
          'Play a card onto any pile that matches the pile’s next value (Wild matches any). Piles advance 1→…→12→1. End turn draws up to five.',
        roundScores: null,
      },
    }
  },

  getLegalActions(table, gs) {
    if (gs.phase !== 'play' || gs.currentPlayer !== 0) return []
    const plays = legalPlays(table, gs.piles, 0)
    const end: GameAction = { type: 'custom', payload: { cmd: 'srEndTurn' } }
    return [...plays, end]
  },

  applyAction(table, gs, action) {
    const t = cloneTable(table)
    const pCount = 2

    const finish = (winner: number): ApplyResult<SequenceRaceGameState> => {
      const rs = [0, 0]
      rs[winner] = 1
      return {
        table: t,
        gameState: {
          ...gs,
          phase: 'done',
          message: `Round over — Player ${winner + 1} emptied their hand.`,
          roundScores: rs,
        },
      }
    }

    if (gs.phase !== 'play') return { table: t, gameState: gs, error: 'Round over.' }
    if (action.type !== 'custom') return { table: t, gameState: gs, error: 'Unknown action.' }

    const cur = gs.currentPlayer
    const command = cmd(action.payload)
    const piles: [number, number, number, number] = [...gs.piles] as [number, number, number, number]

    if (command === 'srPlay') {
      const handIx = Number((action.payload as { handIndex?: unknown }).handIndex)
      const pileIx = Number((action.payload as { pileIndex?: unknown }).pileIndex)
      const hand = t.zones[handId(cur)]!.cards
      if (!Number.isInteger(handIx) || handIx < 0 || handIx >= hand.length)
        return { table: t, gameState: gs, error: 'Bad card.' }
      if (!Number.isInteger(pileIx) || pileIx < 0 || pileIx > 3)
        return { table: t, gameState: gs, error: 'Bad pile.' }
      const card = hand.splice(handIx, 1)[0]!
      const v = cardValue(t.templates, card.templateId)
      if (!canPlayOnPile(piles, pileIx, v)) return { table: t, gameState: gs, error: 'Illegal play.' }
      advancePile(piles, pileIx, v)
      card.faceUp = true
      t.zones.waste!.cards.push(card)

      if (t.zones[handId(cur)]!.cards.length === 0) {
        return finish(cur)
      }

      return {
        table: t,
        gameState: {
          ...gs,
          piles,
          message: `Pile ${pileIx + 1} now needs ${piles[pileIx]}. Still your turn — play or end turn.`,
        },
      }
    }

    if (command === 'srEndTurn') {
      drawToFive(t, cur)
      const next = (cur + 1) % pCount
      return {
        table: t,
        gameState: {
          ...gs,
          piles,
          currentPlayer: next,
          message: `Player ${next + 1}’s turn.`,
        },
      }
    }

    return { table: t, gameState: gs, error: 'Unknown action.' }
  },

  statusText(table, gs) {
    if (gs.phase === 'done') return gs.message
    const [a, b, c, d] = gs.piles
    return `${gs.message} Next values: ${a}/${b}/${c}/${d}. Your hand: ${table.zones['hand:0']!.cards.length}.`
  },

  extractMatchRoundScores(gs) {
    return gs.roundScores
  },

  isMatchRoundFinished(gs) {
    return gs.phase === 'done' && gs.roundScores !== null
  },
}
