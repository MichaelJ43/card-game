import type { GameModule } from '../../core/gameModule'
import type { GameAction } from '../../core/types'
import { newInstanceId } from '../../core/deck'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveCard, moveTop } from '../../core/table'
import { cmd, handId, legalPlays, resolveTrick, totalPlayers } from './helpers'
import type { PinochleGameState } from './types'

export const pinochleLogic: Pick<
  GameModule<PinochleGameState>,
  'setup' | 'getLegalActions' | 'applyAction' | 'statusText' | 'extractMatchRoundScores' | 'isMatchRoundFinished'
> = {
  setup(ctx, instances) {
    const pCount = totalPlayers(ctx.manifest)
    if (pCount !== 2) throw new Error('This Pinochle table is 2-player only.')
    const rng = mulberry32(Math.floor(ctx.rng() * 0xffffffff))
    const doubled = instances.flatMap((c) => [
      { instanceId: newInstanceId(), templateId: c.templateId, faceUp: false },
      { instanceId: newInstanceId(), templateId: c.templateId, faceUp: false },
    ])
    shuffleInPlace(doubled, rng)

    const zoneIds = ['draw', 'trump', 'trick', ...Array.from({ length: pCount }, (_, i) => handId(i))]
    const table = createEmptyTable(ctx.templates, zoneIds, [
      { id: 'draw', kind: 'stack', defaultFaceUp: false },
      { id: 'trump', kind: 'stack', defaultFaceUp: true },
      { id: 'trick', kind: 'spread', defaultFaceUp: true },
      ...Array.from({ length: pCount }, (_, i) => ({
        id: handId(i),
        kind: 'spread' as const,
        defaultFaceUp: false,
        owner: i,
      })),
    ])
    for (const c of doubled) {
      table.zones.draw!.cards.push(c)
    }
    for (let r = 0; r < 12; r++) {
      for (let p = 0; p < pCount; p++) {
        const c = moveTop(table, 'draw', handId(p), p === 0)
        if (c) c.faceUp = p === 0
      }
    }
    const tr = moveTop(table, 'draw', 'trump', true)
    const trumpSuit =
      tr && typeof ctx.templates[tr.templateId]?.suit === 'string'
        ? (ctx.templates[tr.templateId]!.suit as string)
        : 'spades'

    return {
      table,
      gameState: {
        phase: 'play',
        currentPlayer: 0,
        trumpSuit,
        trick: [],
        tricksWon: [0, 0],
        tricksPlayed: 0,
        message: `Trump ${trumpSuit}. Twelve tricks — you lead.`,
        roundScores: null,
      },
    }
  },

  getLegalActions(table, gs) {
    if (gs.phase !== 'play' || gs.currentPlayer !== 0) return []
    const hand = table.zones['hand:0']!.cards
    const idxs = legalPlays(table.templates, hand, gs.trick)
    return idxs.map((i) => ({ type: 'custom', payload: { cmd: 'pncPlay', index: i } }) as GameAction)
  },

  applyAction(table, gs, action) {
    const t = cloneTable(table)
    const pCount = 2

    if (action.type !== 'custom' || cmd(action.payload) !== 'pncPlay') {
      return { table: t, gameState: gs, error: 'Unknown action.' }
    }
    if (gs.phase !== 'play') return { table: t, gameState: gs, error: 'Hand is over.' }

    const cur = gs.currentPlayer
    const ix = Number((action.payload as { index?: unknown }).index)
    const hand = t.zones[handId(cur)]!.cards
    if (!Number.isInteger(ix) || ix < 0 || ix >= hand.length) return { table: t, gameState: gs, error: 'Bad card.' }

    const allowed = legalPlays(t.templates, hand, gs.trick)
    if (!allowed.includes(ix)) return { table: t, gameState: gs, error: 'Illegal follow.' }

    const card = hand[ix]!
    moveCard(t, handId(cur), card.instanceId, 'trick', { faceUp: true })
    const trick = [...gs.trick, { player: cur, templateId: card.templateId }]

    if (trick.length < pCount) {
      return {
        table: t,
        gameState: {
          ...gs,
          trick,
          currentPlayer: (cur + 1) % pCount,
          message: `Trick ${trick.length}/2 — opponent.`,
        },
      }
    }

    const winner = resolveTrick(t.templates, trick, gs.trumpSuit)
    const tricksWon = [...gs.tricksWon]
    tricksWon[winner] = (tricksWon[winner] ?? 0) + 1
    t.zones.trick!.cards.splice(0, t.zones.trick!.cards.length)
    const tricksPlayed = gs.tricksPlayed + 1

    if (tricksPlayed >= 12) {
      return {
        table: t,
        gameState: {
          ...gs,
          trick: [],
          tricksWon,
          tricksPlayed,
          phase: 'done',
          currentPlayer: winner,
          message: `Hand done — tricks ${tricksWon[0]}–${tricksWon[1]}.`,
          roundScores: tricksWon.slice(),
        },
      }
    }

    return {
      table: t,
      gameState: {
        ...gs,
        trick: [],
        tricksWon,
        tricksPlayed,
        currentPlayer: winner,
        message: `Player ${winner + 1} leads.`,
      },
    }
  },

  statusText(_table, gs) {
    if (gs.phase === 'done') return gs.message
    const y = gs.tricksWon[0] ?? 0
    return `${gs.message} Your tricks: ${y}/${12}.`
  },

  extractMatchRoundScores(gs) {
    return gs.roundScores
  },

  isMatchRoundFinished(gs) {
    return gs.phase === 'done' && gs.roundScores !== null
  },
}
