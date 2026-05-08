import type { ApplyResult, GameModule, GameModuleContext, SelectAiContext } from '../../core/gameModule'
import type { CardInstance, CardTemplate } from '../../core/types'
import { playerSeatLabel } from '../../core/playerLabels'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable } from '../../core/table'
import {
  GRID,
  allNonSlotFaceUp,
  allPlayersOpeningReady,
  buildLegalActions,
  clearMatchingColumns,
  countFaceUpNonSlotOnGrid,
  ensureSlotTemplate,
  gridZone,
  isSlot,
  othersAfterSkyjo,
  popTopDraw,
  pushDiscard,
  recycleDiscardIfDrawEmpty,
  scoreRoundState,
  starterFromOpening,
  topDiscard,
  totalPlayers,
} from './helpers'
import { skyjoSelectAiAction } from './opponent'
import type { SkyjoGameState } from './types'

export const skyjoLogic: GameModule<SkyjoGameState> = {
  moduleId: 'skyjo',

  setup(ctx: GameModuleContext, instances: CardInstance[]) {
    const { manifest, templates, rng } = ctx
    const discardSwapFaceUpOnly = ctx.skyjoDiscardSwapFaceUpOnly ?? false
    const reshuffleDiscardWhenDrawEmpty = ctx.reshuffleDiscardWhenDrawEmpty ?? false
    const pCount = totalPlayers(manifest)
    const rngFn = mulberry32(Math.floor(rng() * 0xffffffff))

    const merged: Record<string, CardTemplate> = { ...templates }
    ensureSlotTemplate(merged)

    const zoneIds = ['draw', 'discard', ...Array.from({ length: pCount }, (_, i) => gridZone(i))]
    const table = createEmptyTable(merged, zoneIds, [
      { id: 'draw', kind: 'stack', defaultFaceUp: false },
      { id: 'discard', kind: 'stack', defaultFaceUp: true },
      ...Array.from({ length: pCount }, (_, i) => ({
        id: gridZone(i),
        kind: 'grid' as const,
        defaultFaceUp: false,
        owner: i,
      })),
    ])

    shuffleInPlace(instances, rngFn)
    let k = 0
    for (let p = 0; p < pCount; p++) {
      const g = table.zones[gridZone(p)]!.cards
      for (let s = 0; s < GRID; s++) {
        const card = instances[k++]
        if (!card) break
        card.faceUp = false
        g.push(card)
      }
    }
    while (k < instances.length) {
      const c = instances[k++]!
      c.faceUp = false
      table.zones.draw!.cards.push(c)
    }

    const starterCard = popTopDraw(table)
    if (starterCard) {
      starterCard.faceUp = true
      pushDiscard(table, starterCard)
    }

    return {
      table,
      gameState: {
        phase: 'opening',
        playerCount: pCount,
        currentPlayer: 0,
        message: `${playerSeatLabel(0)} — flip two face-down cards on your grid (then each other player, in turn).`,
        pendingDraw: null,
        pendingFromDiscard: false,
        skyjoFinisher: null,
        finalQueue: [],
        roundScores: null,
        finisherDoubled: false,
        discardSwapFaceUpOnly,
        reshuffleDiscardWhenDrawEmpty,
      },
    }
  },

  getLegalActions(table, gameState) {
    return buildLegalActions(table, gameState)
  },

  applyAction(table, gameState, action): ApplyResult<SkyjoGameState> {
    if (gameState.phase === 'roundOver') {
      return { table, gameState, error: 'Round is over.' }
    }

    const rngFn = mulberry32(Math.floor(Math.random() * 0xffffffff))
    const t = cloneTable(table)
    ensureSlotTemplate(t.templates)
    const templates = t.templates
    const pCount = gameState.playerCount
    const current = gameState.currentPlayer

    if (gameState.phase === 'final' && gameState.finalQueue.length > 0 && gameState.finalQueue[0] !== current) {
      return { table, gameState, error: 'Wait for the correct final-turn player.' }
    }

    recycleDiscardIfDrawEmpty(t, rngFn, gameState.reshuffleDiscardWhenDrawEmpty)

    const gs = gameState

    if (gs.phase === 'opening') {
      if (action.type !== 'skyjoOpeningFlip') {
        return { table, gameState, error: 'Flip a face-down card on your grid.' }
      }
      const i = action.gridIndex
      if (i < 0 || i >= GRID) return { table, gameState, error: 'Bad grid index.' }
      const gOpen = t.zones[gridZone(current)]!.cards
      const target = gOpen[i]
      if (!target || isSlot(target.templateId) || target.faceUp) {
        return { table, gameState, error: 'Choose a face-down card on your grid.' }
      }
      if (countFaceUpNonSlotOnGrid(t, current) >= 2) {
        return { table, gameState, error: 'You have already flipped two cards.' }
      }
      target.faceUp = true
      for (let k = 0; k < 8; k++) {
        if (!clearMatchingColumns(t, current, templates)) break
      }

      if (allPlayersOpeningReady(t, pCount)) {
        const first = starterFromOpening(t, templates, pCount)
        return {
          table: t,
          gameState: {
            ...gs,
            phase: 'play',
            currentPlayer: first,
            pendingDraw: null,
            pendingFromDiscard: false,
            message: `${first === 0 ? 'You start' : `${playerSeatLabel(first)} starts`} (highest sum of two opening cards). Draw or take discard.`,
          },
        }
      }

      const nowUp = countFaceUpNonSlotOnGrid(t, current)
      if (nowUp >= 2) {
        const nx = (current + 1) % pCount
        return {
          table: t,
          gameState: {
            ...gs,
            phase: 'opening',
            currentPlayer: nx,
            pendingDraw: null,
            pendingFromDiscard: false,
            message:
              nx === 0
                ? 'Your turn — flip two face-down cards on your grid.'
                : `${playerSeatLabel(nx)} — flip two face-down cards on your grid.`,
          },
        }
      }

      return {
        table: t,
        gameState: {
          ...gs,
          message: 'Flip one more face-down card on your grid.',
        },
      }
    }

    const endTurn = (next: Partial<SkyjoGameState>, finished: number): ApplyResult<SkyjoGameState> => {
      recycleDiscardIfDrawEmpty(t, rngFn, gs.reshuffleDiscardWhenDrawEmpty)
      if (gs.phase === 'final' && gs.finalQueue.length > 0) {
        const q = [...gs.finalQueue]
        if (q[0] === finished) {
          q.shift()
          if (q.length === 0) {
            const fin = gs.skyjoFinisher ?? finished
            const scored = scoreRoundState(t, templates, pCount, fin)
            return {
              table: t,
              gameState: {
                ...gs,
                ...next,
                pendingDraw: null,
                pendingFromDiscard: false,
                phase: scored.phase,
                roundScores: scored.roundScores ?? null,
                finisherDoubled: scored.finisherDoubled,
                message: scored.message,
                finalQueue: [],
                currentPlayer: finished,
              },
            }
          }
          return {
            table: t,
            gameState: {
              ...gs,
              ...next,
              pendingDraw: null,
              pendingFromDiscard: false,
              finalQueue: q,
              currentPlayer: q[0]!,
              message: `Final turn — ${playerSeatLabel(q[0]!)}’s go.`,
            },
          }
        }
      }
      const nx = (finished + 1) % pCount
      return {
        table: t,
        gameState: {
          ...gs,
          ...next,
          pendingDraw: null,
          pendingFromDiscard: false,
          currentPlayer: nx,
          message: nx === 0 ? 'Your turn.' : `${playerSeatLabel(nx)}'s turn.`,
        },
      }
    }

    const trySkyjo = (msg: string): ApplyResult<SkyjoGameState> | null => {
      if (!allNonSlotFaceUp(t, current)) return null
      if (gs.skyjoFinisher !== null) return null
      const queue = othersAfterSkyjo(current, pCount)
      if (queue.length === 0) {
        const scored = scoreRoundState(t, templates, pCount, current)
        return {
          table: t,
          gameState: {
            ...gs,
            phase: scored.phase,
            roundScores: scored.roundScores ?? null,
            finisherDoubled: scored.finisherDoubled,
            message: `${msg} Skyjo! ${scored.message}`,
            pendingDraw: null,
            pendingFromDiscard: false,
            skyjoFinisher: current,
            finalQueue: [],
          },
        }
      }
      return {
        table: t,
        gameState: {
          ...gs,
          phase: 'final',
          skyjoFinisher: current,
          finalQueue: queue,
          currentPlayer: queue[0]!,
          message: `${msg} Skyjo! One more turn each for other players.`,
          pendingDraw: null,
          pendingFromDiscard: false,
        },
      }
    }

    // --- Resolve pending draw ---
    if (gs.pendingDraw) {
      const pending = gs.pendingDraw
      if (action.type === 'skyjoSwapDrawn') {
        const i = action.gridIndex
        if (i < 0 || i >= GRID) return { table, gameState, error: 'Bad grid index.' }
        const g = t.zones[gridZone(current)]!.cards
        const old = g[i]!
        if (gs.discardSwapFaceUpOnly && gs.pendingFromDiscard) {
          if (isSlot(old.templateId) || !old.faceUp) {
            return {
              table,
              gameState,
              error: 'With this house rule, discard may only replace a face-up card.',
            }
          }
        }
        g[i] = pending
        pending.faceUp = true
        pushDiscard(t, old)
        let msg = `Swapped into slot ${i + 1}.`
        const cm = clearMatchingColumns(t, current, templates)
        if (cm) msg += ` ${cm}`
        const sky = trySkyjo(msg)
        if (sky) return sky
        return endTurn({ message: msg }, current)
      }
      if (action.type === 'skyjoDumpDraw') {
        if (gs.pendingFromDiscard) {
          return { table, gameState, error: 'You must place the discard you took.' }
        }
        const i = action.flipIndex
        const g = t.zones[gridZone(current)]!.cards
        const target = g[i]
        if (!target || isSlot(target.templateId) || target.faceUp) {
          return { table, gameState, error: 'Pick a face-down card to flip.' }
        }
        pushDiscard(t, pending)
        target.faceUp = true
        let msg = 'Discarded draw and flipped a card.'
        const cm = clearMatchingColumns(t, current, templates)
        if (cm) msg += ` ${cm}`
        const sky = trySkyjo(msg)
        if (sky) return sky
        return endTurn({ message: msg }, current)
      }
      return { table, gameState, error: 'Swap the card onto your grid or dump & flip (deck draw only).' }
    }

    if (action.type === 'skyjoDraw' && action.from === 'deck') {
      recycleDiscardIfDrawEmpty(t, rngFn, gs.reshuffleDiscardWhenDrawEmpty)
      const drawn = popTopDraw(t)
      if (!drawn) {
        recycleDiscardIfDrawEmpty(t, rngFn, gs.reshuffleDiscardWhenDrawEmpty)
        const d2 = popTopDraw(t)
        if (!d2) return { table, gameState, error: 'Draw pile is empty.' }
        d2.faceUp = true
        return {
          table: t,
          gameState: {
            ...gs,
            pendingDraw: d2,
            pendingFromDiscard: false,
            message: 'Drew a card — swap or dump & flip.',
          },
        }
      }
      drawn.faceUp = true
      return {
        table: t,
        gameState: {
          ...gs,
          pendingDraw: drawn,
          pendingFromDiscard: false,
          message: 'Drew a card — swap or dump & flip.',
        },
      }
    }

    if (action.type === 'skyjoTakeDiscard') {
      const i = action.gridIndex
      if (i < 0 || i >= GRID) return { table, gameState, error: 'Bad grid index.' }
      if (gs.discardSwapFaceUpOnly) {
        const g = t.zones[gridZone(current)]!.cards
        const cell = g[i]
        if (!cell || isSlot(cell.templateId) || !cell.faceUp) {
          return {
            table,
            gameState,
            error: 'Take discard only by choosing a face-up card to replace (house rule).',
          }
        }
      }
      const d = topDiscard(t)
      if (!d) return { table, gameState, error: 'Discard is empty.' }
      t.zones.discard!.cards.pop()
      d.faceUp = true
      return {
        table: t,
        gameState: {
          ...gs,
          pendingDraw: d,
          pendingFromDiscard: true,
          message: 'Place the discard on your grid.',
        },
      }
    }

    return { table, gameState, error: 'Unsupported action.' }
  },

  selectAiAction(table, gameState, playerIndex, rng, context: SelectAiContext) {
    if (gameState.phase === 'roundOver') return null
    if (gameState.currentPlayer !== playerIndex) return null
    const legal = buildLegalActions(table, gameState)
    if (legal.length === 0) return null
    return skyjoSelectAiAction(table, gameState, playerIndex, rng, context, legal)
  },

  statusText(_table, gameState) {
    if (gameState.roundScores) {
      return `${gameState.message}`
    }
    return gameState.message
  },

  isMatchRoundFinished(gs) {
    return gs.phase === 'roundOver' && Array.isArray(gs.roundScores) && gs.roundScores.length > 0
  },

  extractMatchRoundScores(gs) {
    if (gs.phase !== 'roundOver' || !gs.roundScores?.length) return null
    return gs.roundScores
  },

  extractMatchRoundScoreCellNotes(gs) {
    if (gs.phase !== 'roundOver' || !gs.roundScores?.length) return null
    const n = gs.roundScores.length
    if (!gs.finisherDoubled) return Array.from({ length: n }, () => null)
    const fin = gs.skyjoFinisher
    if (fin == null || fin < 0 || fin >= n) return Array.from({ length: n }, () => null)
    return Array.from({ length: n }, (_, i) =>
      i === fin ? 'This score was doubled: first to go out, but not the lowest (or tied lowest) value.' : null,
    )
  },
}
