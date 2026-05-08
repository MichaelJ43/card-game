import type { SelectAiContext } from '../../core/gameModule'
import type { GameAction } from '../../core/types'
import type { TableState } from '../../core/types'
import type { SkyjoGameState } from './types'
import {
  COLS,
  GRID,
  avgFaceUpOnGrid,
  cardValue,
  completesColumnTriple,
  columnIndices,
  estimatedCellContribution,
  expertClogLastHiddenInPairColumn,
  expertLoomingPairBreakPenalty,
  expertTripleCompletionHalo,
  expectedUnknownCardValue,
  gridZone,
  isSlot,
  maxDiscardPlacementMerit,
  pendingActionFinisherPenalty,
  rediscardPressureForValue,
  remainingUnknownComposition,
  sumVisibleFaceUpOnGrid,
  topDiscard,
  varianceUnknownCard,
} from './helpers'

export function skyjoSelectAiAction(
  table: TableState,
  gameState: SkyjoGameState,
  playerIndex: number,
  rng: () => number,
  context: SelectAiContext,
  legal: GameAction[],
): GameAction {
  const { difficulty, matchCumulativeScores, matchTargetScore } = context
  const isExpert = difficulty === 'expert'
  const isHard = difficulty === 'hard' || isExpert
  const myCum = matchCumulativeScores?.[playerIndex] ?? 0
  const matchTarget = matchTargetScore ?? 100
  const templates = table.templates
  const g = table.zones[gridZone(playerIndex)]!.cards

  const takeDiscardAction = (): GameAction => {
    const take = legal.find((a) => a.type === 'skyjoTakeDiscard')
    return take ?? { type: 'skyjoTakeDiscard', gridIndex: 0 }
  }

  /** Lower score is better (estimated increase to grid sum, minus bonuses). */
  const bestPendingActionSmart = (expert: boolean): GameAction => {
    const pv = cardValue(templates, gameState.pendingDraw!.templateId)
    const pCount = gameState.playerCount
    const comp = remainingUnknownComposition(table, templates, pCount)
    const evUnknown = expectedUnknownCardValue(comp.counts, comp.total)
    const stdU = Math.sqrt(varianceUnknownCard(comp.counts, comp.total))
    const visSum = sumVisibleFaceUpOnGrid(table, playerIndex, templates)
    const visW =
      expert && visSum > 22
        ? 1 + Math.min(0.2, (visSum - 22) * 0.014)
        : 1
    const finM = expert ? 0.88 : 0.62
    const nextP = (playerIndex + 1) % pCount
    const pending = gameState.pendingDraw!

    const swaps = legal.filter((a): a is Extract<GameAction, { type: 'skyjoSwapDrawn' }> => a.type === 'skyjoSwapDrawn')
    const dumps = legal.filter((a): a is Extract<GameAction, { type: 'skyjoDumpDraw' }> => a.type === 'skyjoDumpDraw')

    let best: GameAction = swaps[0] ?? dumps[0]!
    let bestScore = Infinity

    for (const a of swaps) {
      const i = a.gridIndex
      const c = g[i]
      if (!c || isSlot(c.templateId)) continue
      const oldEst = estimatedCellContribution(templates, c)
      let score = pv - oldEst
      if (completesColumnTriple(table, playerIndex, templates, i, pv)) {
        score -= 24
      }
      if (expert) {
        if (!c.faceUp) score += 0.3 * stdU
        score += expertClogLastHiddenInPairColumn(table, playerIndex, templates, i, pv, expert)
        score += expertLoomingPairBreakPenalty(table, playerIndex, templates, i, pv, expert)
        score += expertTripleCompletionHalo(
          table,
          playerIndex,
          i,
          pv,
          templates,
          comp.counts,
          comp.total,
          expert,
        )
      }
      const oldToDiscard = c.faceUp ? cardValue(templates, c.templateId) : evUnknown
      const helpsNext = maxDiscardPlacementMerit(table, nextP, templates, oldToDiscard)
      score += helpsNext * 0.45
      const finishPen = pendingActionFinisherPenalty(
        table,
        templates,
        playerIndex,
        pending,
        { type: 'skyjoSwapDrawn', gridIndex: i },
        pCount,
        evUnknown,
        myCum,
        matchTarget,
        gameState.skyjoFinisher,
      )
      score += finishPen * finM * visW
      if (score < bestScore) {
        bestScore = score
        best = a
      }
    }

    if (!gameState.pendingFromDiscard && dumps.length > 0) {
      const minSwapDelta = swaps.reduce((acc, a) => {
        const c = g[a.gridIndex]
        if (!c || isSlot(c.templateId)) return acc
        const oldEst = estimatedCellContribution(templates, c)
        return Math.min(acc, pv - oldEst)
      }, Infinity)

      /** Swap clearly lowers expected sum — keep the card on the grid. */
      const swapIsStrong = Number.isFinite(minSwapDelta) && minSwapDelta <= (expert ? -1.5 : -2)

      let bestDump = dumps[0]!
      let dumpRank = -Infinity
      let dumpFpen = 0
      for (const a of dumps) {
        const i = a.flipIndex
        const [x, y, z] = columnIndices(i % COLS)
        let rank = 0
        for (const idx of [x, y, z]) {
          if (idx === i) continue
          const card = g[idx]
          if (!card || isSlot(card.templateId) || !card.faceUp) continue
          rank += cardValue(templates, card.templateId)
        }
        const peers = [x, y, z].filter((idx) => idx !== i)
        const v0 = g[peers[0]!]
        const v1 = g[peers[1]!]
        if (
          v0 &&
          v1 &&
          !isSlot(v0.templateId) &&
          !isSlot(v1.templateId) &&
          v0.faceUp &&
          v1.faceUp &&
          cardValue(templates, v0.templateId) === cardValue(templates, v1.templateId)
        ) {
          rank += 50
        }
        const fpen = pendingActionFinisherPenalty(
          table,
          templates,
          playerIndex,
          pending,
          { type: 'skyjoDumpDraw', flipIndex: i },
          pCount,
          evUnknown,
          myCum,
          matchTarget,
          gameState.skyjoFinisher,
        )
        const fMult = expert ? 0.88 : 0.95
        const adjRank = rank - fpen * fMult
        if (adjRank > dumpRank) {
          dumpRank = adjRank
          bestDump = a
          dumpFpen = fpen
        }
      }

      if (!swapIsStrong) {
        const giftPv = maxDiscardPlacementMerit(table, nextP, templates, pv)
        const useDump = expert
          ? pv >= 11 ||
            (pv >= 9 && minSwapDelta >= 0) ||
            (pv >= 7 && minSwapDelta >= 1) ||
            (pv >= 5.5 && minSwapDelta >= 2.6)
          : pv >= 10 ||
            (pv >= 8 && minSwapDelta >= 0) ||
            (pv >= 6 && minSwapDelta >= 1.5) ||
            (pv >= 5 && minSwapDelta >= 3)
        const dumpFeedsNext = pv <= 4 && giftPv > 2.25
        const fMultRisk = expert ? 0.85 : 0.62
        const riskTh = expert ? 11 : 14
        const minDeltaTh = expert ? 2.4 : 2
        const dumpTooRisky = dumpFpen * fMultRisk > riskTh && minSwapDelta <= minDeltaTh
        const badVisibleFinish = expert && visSum > 24 && dumpFpen > 7.5
        if (useDump && !dumpFeedsNext && !dumpTooRisky && !badVisibleFinish) {
          return bestDump
        }
        if (useDump && dumpFeedsNext && pv >= 9 && !dumpTooRisky && !badVisibleFinish) {
          return bestDump
        }
      }
    }

    return best
  }

  const pendingActionMedium = (): GameAction => {
    const pv = cardValue(templates, gameState.pendingDraw!.templateId)
    const pCount = gameState.playerCount
    const comp = remainingUnknownComposition(table, templates, pCount)
    const evUnknown = expectedUnknownCardValue(comp.counts, comp.total)
    const nextP = (playerIndex + 1) % pCount
    const pending = gameState.pendingDraw!
    let bestSwap = 0
    let bestGain = -Infinity
    for (let i = 0; i < GRID; i++) {
      const c = g[i]
      if (!c || isSlot(c.templateId)) continue
      const oldEst = estimatedCellContribution(templates, c)
      const oldToDiscard = c.faceUp ? cardValue(templates, c.templateId) : evUnknown
      const helpsNext = maxDiscardPlacementMerit(table, nextP, templates, oldToDiscard)
      const finishPen = pendingActionFinisherPenalty(
        table,
        templates,
        playerIndex,
        pending,
        { type: 'skyjoSwapDrawn', gridIndex: i },
        pCount,
        evUnknown,
        myCum,
        matchTarget,
        gameState.skyjoFinisher,
      )
      const gain = oldEst - pv - helpsNext * 0.22 - finishPen * 0.34
      const bonus = completesColumnTriple(table, playerIndex, templates, i, pv) ? 6 : 0
      if (gain + bonus > bestGain) {
        bestGain = gain + bonus
        bestSwap = i
      }
    }
    const dumpTh = difficulty === 'easy' ? 11 : 7
    if (!gameState.pendingFromDiscard && pv > dumpTh) {
      const dumps = legal.filter((a) => a.type === 'skyjoDumpDraw')
      if (dumps.length > 0) {
        const scored = dumps.map((a) => ({
          a,
          pen: pendingActionFinisherPenalty(
            table,
            templates,
            playerIndex,
            pending,
            { type: 'skyjoDumpDraw', flipIndex: a.flipIndex },
            pCount,
            evUnknown,
            myCum,
            matchTarget,
            gameState.skyjoFinisher,
          ),
        }))
        scored.sort((x, y) => x.pen - y.pen)
        if (rng() < 0.55) return scored[0]!.a
        return dumps[Math.floor(rng() * dumps.length)]!
      }
    }
    return { type: 'skyjoSwapDrawn', gridIndex: bestSwap }
  }

  const noPendingSmart = (expert: boolean): GameAction => {
    const disc = topDiscard(table)
    const dv = disc ? cardValue(templates, disc.templateId) : 999
    const drawAvail = table.zones.draw!.cards.length > 0
    const pCount = gameState.playerCount
    const comp = remainingUnknownComposition(table, templates, pCount)
    const evUnknown = expectedUnknownCardValue(comp.counts, comp.total)
    const prevP = (playerIndex - 1 + pCount) % pCount
    const nextP = (playerIndex + 1) % pCount
    const avgPrev = avgFaceUpOnGrid(table, prevP, templates)

    let takeMerit = disc ? maxDiscardPlacementMerit(table, playerIndex, templates, dv) : -Infinity
    const drawMerit = maxDiscardPlacementMerit(table, playerIndex, templates, evUnknown)

    const takeActions = legal.filter((a) => a.type === 'skyjoTakeDiscard')
    if (disc && takeActions.length > 0) {
      const giftNextIfWeDraw = maxDiscardPlacementMerit(table, nextP, templates, dv)
      takeMerit += giftNextIfWeDraw * (expert ? 0.35 : 0.42)
      const red = rediscardPressureForValue(dv, comp.counts, comp.total, avgPrev)
      takeMerit -= red * (expert ? 3.2 : 2.8)
      if (expert) {
        if (dv <= 1) return takeDiscardAction()
        const needEdge = 0.55 + Math.min(0.9, red * 2.0)
        if (takeMerit >= drawMerit + needEdge && dv <= evUnknown + 0.45) return takeDiscardAction()
        if (dv <= 2 && takeMerit >= drawMerit - 0.08) return takeDiscardAction()
        if (dv <= 3 && takeMerit >= drawMerit + 0.38 && dv <= evUnknown + 0.25) return takeDiscardAction()
        if (dv < evUnknown - 0.35 && takeMerit < drawMerit + 0.35) {
          /* low pip but poor fit — prefer stock */
        } else if (dv <= 4 && takeMerit >= 0.15 && dv <= evUnknown + 0.9) {
          return takeDiscardAction()
        }
      } else {
        if (dv <= 2) return takeDiscardAction()
        if (takeMerit >= drawMerit + 0.25 && dv <= evUnknown + 1.2) return takeDiscardAction()
        if (dv <= 4 && takeMerit >= -0.5) return takeDiscardAction()
      }
    }
    if (drawAvail) {
      return { type: 'skyjoDraw', from: 'deck' }
    }
    if (takeActions.length > 0) return takeDiscardAction()
    return legal[Math.floor(rng() * legal.length)]!
  }

  const noPendingMedium = (): GameAction => {
    const disc = topDiscard(table)
    const dv = disc ? cardValue(templates, disc.templateId) : 999
    const pCount = gameState.playerCount
    const comp = remainingUnknownComposition(table, templates, pCount)
    const evUnknown = expectedUnknownCardValue(comp.counts, comp.total)
    const prevP = (playerIndex - 1 + pCount) % pCount
    const nextP = (playerIndex + 1) % pCount
    const avgPrev = avgFaceUpOnGrid(table, prevP, templates)

    let takeMerit = disc ? maxDiscardPlacementMerit(table, playerIndex, templates, dv) : -Infinity
    const drawMerit = maxDiscardPlacementMerit(table, playerIndex, templates, evUnknown)
    if (disc) {
      takeMerit += maxDiscardPlacementMerit(table, nextP, templates, dv) * 0.28
      takeMerit -= rediscardPressureForValue(dv, comp.counts, comp.total, avgPrev) * 1.6
    }
    if (disc && dv <= 3) return takeDiscardAction()
    if (disc && dv <= 6 && takeMerit >= Math.max(1.2, drawMerit - 0.2)) return takeDiscardAction()
    if (table.zones.draw!.cards.length > 0) {
      return { type: 'skyjoDraw', from: 'deck' }
    }
    if (disc) return takeDiscardAction()
    return legal[Math.floor(rng() * legal.length)]!
  }

  if (gameState.phase === 'opening') {
    const flips = legal.filter((a): a is Extract<GameAction, { type: 'skyjoOpeningFlip' }> => a.type === 'skyjoOpeningFlip')
    if (flips.length === 0) return legal[0]!
    return flips[Math.floor(rng() * flips.length)]!
  }

  if (gameState.pendingDraw) {
    if (difficulty === 'easy' && rng() < 0.4) {
      const swaps = legal.filter((a) => a.type === 'skyjoSwapDrawn')
      const dumps = legal.filter((a) => a.type === 'skyjoDumpDraw')
      const pool = [...swaps, ...dumps]
      if (pool.length > 0) return pool[Math.floor(rng() * pool.length)]!
    }
    if (isHard) return bestPendingActionSmart(isExpert)
    return pendingActionMedium()
  }

  if (difficulty === 'easy' && rng() < 0.35 && table.zones.draw!.cards.length > 0) {
    return { type: 'skyjoDraw', from: 'deck' }
  }

  if (isHard) {
    return noPendingSmart(isExpert)
  }

  if (difficulty === 'easy' && rng() < 0.42) {
    return legal[Math.floor(rng() * legal.length)]!
  }

  return noPendingMedium()
}
