import type { ApplyResult, GameModule, GameModuleContext } from '../../core/gameModule'
import type { CardInstance } from '../../core/types'
import { shuffleCards } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveTop } from '../../core/table'
import {
  advanceToPlayableOrEnd,
  booksId,
  enumerateLegalAsks,
  finalizeIfOver,
  handCardCount,
  handId,
  drawCount,
  layBooksFromHand,
  rankOf,
  removeAllOfRank,
  replenishIfEmpty,
  scoreBooks,
  setHandCardVisibility,
  totalPlayers,
} from './helpers'
import type { GoFishGameState } from './types'

export const goFishLogic: Pick<
  GameModule<GoFishGameState>,
  'setup' | 'getLegalActions' | 'applyAction' | 'statusText'
> = {
  setup(ctx: GameModuleContext, instances: CardInstance[]) {
    const { manifest, templates, rng } = ctx
    const pCount = totalPlayers(manifest)
    const handSize = pCount === 2 ? 7 : 5

    const zoneIds = [
      'draw',
      ...Array.from({ length: pCount }, (_, i) => handId(i)),
      ...Array.from({ length: pCount }, (_, i) => booksId(i)),
    ]

    const table = createEmptyTable(templates, zoneIds, [
      { id: 'draw', kind: 'stack', defaultFaceUp: false },
      ...Array.from({ length: pCount }, (_, i) => ({
        id: handId(i),
        kind: 'spread' as const,
        defaultFaceUp: false,
        owner: i,
      })),
      ...Array.from({ length: pCount }, (_, i) => ({
        id: booksId(i),
        kind: 'spread' as const,
        defaultFaceUp: true,
        owner: i,
      })),
    ])

    const shuffled = shuffleCards(instances, { seed: Math.floor(rng() * 0xffffffff) })
    let k = 0
    for (let round = 0; round < handSize; round++) {
      for (let p = 0; p < pCount; p++) {
        const c = shuffled[k++]
        if (!c) break
        setHandCardVisibility(table, p, c)
        table.zones[handId(p)]!.cards.push(c)
      }
    }
    while (k < shuffled.length) {
      const c = shuffled[k++]!
      c.faceUp = false
      table.zones.draw!.cards.push(c)
    }

    for (let p = 0; p < pCount; p++) {
      layBooksFromHand(table, p, templates)
    }

    const current = 0
    replenishIfEmpty(table, current, templates)

    const bookCounts = scoreBooks(table, pCount)
    const initial = finalizeIfOver(table, pCount, '', bookCounts)
    if (initial) {
      return { table, gameState: { ...initial, message: initial.message || 'Game over.' } }
    }

    return {
      table,
      gameState: {
        phase: 'playing',
        playerCount: pCount,
        currentPlayer: current,
        message: `Player ${current}'s turn. Ask for a rank you hold.`,
        winnerIndex: null,
        bookCounts,
      },
    }
  },

  getLegalActions(table, gameState) {
    if (gameState.phase === 'over') return []
    const p = gameState.currentPlayer
    const asks = enumerateLegalAsks(table, table.templates, p, gameState.playerCount)
    if (asks.length > 0) return asks
    return [{ type: 'goFishPass' }]
  },

  applyAction(table, gameState, action): ApplyResult<GoFishGameState> {
    if (gameState.phase === 'over') {
      return { table, gameState, error: 'Game is over.' }
    }

    const t = cloneTable(table)
    const pCount = gameState.playerCount
    const current = gameState.currentPlayer

    if (action.type === 'goFishPass') {
      replenishIfEmpty(t, current, t.templates)
      const legal = enumerateLegalAsks(t, t.templates, current, pCount)
      if (legal.length > 0) {
        return { table, gameState, error: 'You have a legal ask — cannot pass.' }
      }
      const next = (current + 1) % pCount
      const gs = advanceToPlayableOrEnd(t, next, pCount, t.templates, 'Pass.')
      return { table: t, gameState: gs }
    }

    if (action.type !== 'goFishAsk') {
      return { table, gameState, error: 'Unsupported action.' }
    }

    const { targetPlayer, rank } = action

    if (targetPlayer < 0 || targetPlayer >= pCount || targetPlayer === current) {
      return { table, gameState, error: 'Invalid target.' }
    }

    replenishIfEmpty(t, current, t.templates)

    const requesterHand = t.zones[handId(current)]!.cards
    const hasRank = requesterHand.some((c) => rankOf(t.templates, c.templateId) === rank)
    if (!hasRank) {
      return { table, gameState, error: 'You must hold at least one card of that rank to ask for it.' }
    }

    if (handCardCount(t, current) === 0 && drawCount(t) === 0) {
      const gs = advanceToPlayableOrEnd(t, (current + 1) % pCount, pCount, t.templates, 'No cards and empty deck — turn passes.')
      return { table: t, gameState: gs }
    }

    const targetHand = t.zones[handId(targetPlayer)]!.cards
    const given = removeAllOfRank(targetHand, t.templates, rank)
    for (const c of given) {
      setHandCardVisibility(t, current, c)
      requesterHand.push(c)
    }
    layBooksFromHand(t, current, t.templates)

    let message: string
    let anotherTurn = false

    if (given.length > 0) {
      message = `Player ${targetPlayer} gave ${given.length} card(s). Go again.`
      anotherTurn = true
    } else {
      message = 'Go fish!'
      if (drawCount(t) === 0) {
        message += ' Deck is empty — turn passes.'
        anotherTurn = false
      } else {
        const drawn = moveTop(t, 'draw', handId(current), true)
        if (drawn) {
          setHandCardVisibility(t, current, drawn)
          const drawnRank = rankOf(t.templates, drawn.templateId)
          layBooksFromHand(t, current, t.templates)
          if (drawnRank === rank) {
            message += ` You drew a ${drawnRank}. Go again.`
            anotherTurn = true
          } else {
            message += ` You drew a ${drawnRank}. Turn over.`
            anotherTurn = false
          }
        } else {
          anotherTurn = false
        }
      }
    }

    const bookCounts = scoreBooks(t, pCount)
    const earlyEnd = finalizeIfOver(t, pCount, message, bookCounts)
    if (earlyEnd) {
      return { table: t, gameState: earlyEnd }
    }

    if (anotherTurn) {
      replenishIfEmpty(t, current, t.templates)
      return {
        table: t,
        gameState: {
          phase: 'playing',
          playerCount: pCount,
          currentPlayer: current,
          message,
          winnerIndex: null,
          bookCounts,
        },
      }
    }

    const nextPlayer = (current + 1) % pCount
    const gs = advanceToPlayableOrEnd(t, nextPlayer, pCount, t.templates, message)
    return { table: t, gameState: gs }
  },
  statusText(table, gameState) {
    const books = scoreBooks(table, gameState.playerCount).join(' | ')
    return `${gameState.message} — Books per player: ${books}`
  },
}
