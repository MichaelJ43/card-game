import type { ApplyResult, GameModule, GameModuleContext, SelectAiContext } from '../../core/gameModule'
import type { CardInstance, GameAction, GameManifestYaml } from '../../core/types'
import type { CardTemplate } from '../../core/types'
import { playerSeatLabel } from '../../core/playerLabels'
import { registerGameModule } from '../../core/registry'
import { recycleDiscardIntoDrawWhenEmpty, isDeckDrawAvailableAfterOptionalRecycle } from '../../core/discardRecycle'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable } from '../../core/table'
import type { TableState } from '../../core/types'

const GRID = 12
const COLS = 4
const SLOT = '__slot__'

function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

function gridZone(p: number): string {
  return `grid:${p}`
}

function cardValue(templates: Record<string, CardTemplate>, templateId: string): number {
  if (templateId === SLOT) return 0
  const v = templates[templateId]?.value
  return typeof v === 'number' ? v : 0
}

function isSlot(templateId: string): boolean {
  return templateId === SLOT
}

/** True for empty grid placeholders (not real cards). Used by table UI intents. */
export function isSkyjoSlotTemplateId(templateId: string): boolean {
  return isSlot(templateId)
}

function topDiscard(table: TableState): CardInstance | undefined {
  const d = table.zones.discard?.cards
  if (!d?.length) return undefined
  return d[d.length - 1]
}

function popTopDraw(table: TableState): CardInstance | undefined {
  const d = table.zones.draw?.cards
  if (!d?.length) return undefined
  return d.pop()
}

function pushDiscard(table: TableState, card: CardInstance): void {
  card.faceUp = true
  table.zones.discard!.cards.push(card)
}

function recycleDiscardIfDrawEmpty(table: TableState, rng: () => number, enabled: boolean): void {
  recycleDiscardIntoDrawWhenEmpty(table, rng, { enabled, preserveTopDiscard: true })
}

function columnIndices(c: number): [number, number, number] {
  return [c, c + COLS, c + 2 * COLS]
}

/** Population mean of the Skyjo deck (−2…12, 150 cards). Used to value unknown grid cells. */
const SKYJO_DECK_MEAN = 760 / 150

/** Official-style 150-card counts; used for unknown-pile composition. */
const SKYJO_INITIAL_COUNTS: Readonly<Record<number, number>> = {
  [-2]: 5,
  [-1]: 10,
  [0]: 15,
  [1]: 10,
  [2]: 10,
  [3]: 10,
  [4]: 10,
  [5]: 10,
  [6]: 10,
  [7]: 10,
  [8]: 10,
  [9]: 10,
  [10]: 10,
  [11]: 10,
  [12]: 10,
}

/** Remaining multiset for cards still face-down on grids or in the draw pile (not known individually). */
function remainingUnknownComposition(
  table: TableState,
  templates: Record<string, CardTemplate>,
  pCount: number,
): { counts: Record<number, number>; total: number } {
  const counts: Record<number, number> = { ...SKYJO_INITIAL_COUNTS }
  const dec = (v: number) => {
    counts[v] = (counts[v] ?? 0) - 1
  }
  for (const c of table.zones.discard?.cards ?? []) {
    if (!c || isSlot(c.templateId)) continue
    dec(cardValue(templates, c.templateId))
  }
  for (let p = 0; p < pCount; p++) {
    for (const c of table.zones[gridZone(p)]!.cards) {
      if (!c || isSlot(c.templateId)) continue
      if (c.faceUp) dec(cardValue(templates, c.templateId))
    }
  }
  let total = 0
  for (const k of Object.keys(counts)) {
    const n = counts[Number(k)] ?? 0
    if (n > 0) total += n
  }
  return { counts, total }
}

function expectedUnknownCardValue(counts: Record<number, number>, total: number): number {
  if (total <= 0) return SKYJO_DECK_MEAN
  let s = 0
  for (const [k, n] of Object.entries(counts)) {
    if (n <= 0) continue
    s += Number(k) * n
  }
  return s / total
}

/** Average face-up card value on a player’s grid (null if none face-up). */
function avgFaceUpOnGrid(table: TableState, playerIndex: number, templates: Record<string, CardTemplate>): number | null {
  const g = table.zones[gridZone(playerIndex)]!.cards
  let s = 0
  let n = 0
  for (const c of g) {
    if (!c || isSlot(c.templateId) || !c.faceUp) continue
    s += cardValue(templates, c.templateId)
    n++
  }
  return n > 0 ? s / n : null
}

/**
 * Heuristic: how “easy” it is to see value `dv` on the discard again soon — from global counts,
 * shedding bias (highs get swapped off), and the previous player’s visible average (low visible
 * ⇒ more hidden mass, often higher, likely to be discarded later).
 */
function rediscardPressureForValue(
  dv: number,
  counts: Record<number, number>,
  total: number,
  prevPlayerAvgFace: number | null,
): number {
  if (total <= 0) return 0
  const share = (counts[dv] ?? 0) / total
  const shedBoost = 1 + Math.max(0, dv) / 9
  const prevBoost =
    prevPlayerAvgFace !== null
      ? 1 + (Math.max(0, SKYJO_DECK_MEAN - prevPlayerAvgFace) / SKYJO_DECK_MEAN) * 0.55
      : 1
  return share * shedBoost * prevBoost
}

function estimatedCellContribution(templates: Record<string, CardTemplate>, c: CardInstance | undefined): number {
  if (!c || isSlot(c.templateId)) return 0
  if (c.faceUp) return cardValue(templates, c.templateId)
  return SKYJO_DECK_MEAN
}

/** 1 if placing `placeVal` at `placeIdx` completes a face-up triple in that column. */
function completesColumnTriple(
  table: TableState,
  playerIndex: number,
  templates: Record<string, CardTemplate>,
  placeIdx: number,
  placeVal: number,
): boolean {
  const col = placeIdx % COLS
  const [a, b, d] = columnIndices(col)
  const g = table.zones[gridZone(playerIndex)]!.cards
  const vals: number[] = []
  for (const idx of [a, b, d]) {
    if (idx === placeIdx) {
      vals.push(placeVal)
      continue
    }
    const card = g[idx]
    if (!card || isSlot(card.templateId) || !card.faceUp) return false
    vals.push(cardValue(templates, card.templateId))
  }
  return vals[0] === vals[1] && vals[1] === vals[2]
}

/** Best (oldEst − dv): positive means discard replaces something worse than dv. */
function maxDiscardPlacementMerit(
  table: TableState,
  playerIndex: number,
  templates: Record<string, CardTemplate>,
  dv: number,
): number {
  const g = table.zones[gridZone(playerIndex)]!.cards
  let best = -Infinity
  for (let i = 0; i < GRID; i++) {
    const c = g[i]
    if (!c || isSlot(c.templateId)) continue
    const oldEst = estimatedCellContribution(templates, c)
    best = Math.max(best, oldEst - dv)
  }
  return best
}

function makeSlot(): CardInstance {
  return { instanceId: crypto.randomUUID(), templateId: SLOT, faceUp: true }
}

function clearMatchingColumns(
  table: TableState,
  player: number,
  templates: Record<string, CardTemplate>,
): string | undefined {
  const z = table.zones[gridZone(player)]!.cards
  for (let c = 0; c < COLS; c++) {
    const [a, b, d] = columnIndices(c)
    const A = z[a]
    const B = z[b]
    const D = z[d]
    if (!A || !B || !D) continue
    if (isSlot(A.templateId) || isSlot(B.templateId) || isSlot(D.templateId)) continue
    if (!A.faceUp || !B.faceUp || !D.faceUp) continue
    const va = cardValue(templates, A.templateId)
    const vb = cardValue(templates, B.templateId)
    const vd = cardValue(templates, D.templateId)
    if (va === vb && vb === vd) {
      for (const idx of [a, b, d]) {
        const card = z[idx]!
        pushDiscard(table, card)
        z[idx] = makeSlot()
      }
      return `Column ${c + 1} cleared (three × ${va}).`
    }
  }
  return undefined
}

function roundScoreForPlayer(table: TableState, templates: Record<string, CardTemplate>, p: number): number {
  let s = 0
  for (const c of table.zones[gridZone(p)]!.cards) {
    if (isSlot(c.templateId)) continue
    s += cardValue(templates, c.templateId)
  }
  return s
}

function allNonSlotFaceUp(table: TableState, p: number): boolean {
  for (const c of table.zones[gridZone(p)]!.cards) {
    if (isSlot(c.templateId)) continue
    if (!c.faceUp) return false
  }
  return true
}

/** Expected round total for a player using known face-up cells and `evUnknown` for face-down. */
function estimatedRoundScoreForPlayer(
  table: TableState,
  p: number,
  templates: Record<string, CardTemplate>,
  evUnknown: number,
): number {
  let s = 0
  for (const c of table.zones[gridZone(p)]!.cards) {
    if (!c || isSlot(c.templateId)) continue
    s += c.faceUp ? cardValue(templates, c.templateId) : evUnknown
  }
  return s
}

/** Soft estimate of P(round score is strictly worse than the best opponent estimate → finisher doubled). */
function softProbFinisherNotLowest(myRaw: number, minOtherEst: number): number {
  if (myRaw <= 0) return 0
  const margin = myRaw - minOtherEst
  if (margin <= -3) return 0
  if (margin >= 14) return 1
  return (margin + 3) / 17
}

/**
 * Expected pain from the finisher double rule: duplicate round points × risk, scaled by how high we
 * already are vs match target (nearing 100 hurts more in lowest-total-wins races).
 */
function expectedFinisherDoublePain(
  myRaw: number,
  minOtherEst: number,
  cumulativeBefore: number,
  targetScore: number,
): number {
  const p = softProbFinisherNotLowest(myRaw, minOtherEst)
  const duplicateRound = p * myRaw
  const T = Math.max(35, targetScore)
  const c = Math.max(0, cumulativeBefore)
  const nearEnd = (c / T) ** 1.28
  return duplicateRound * (1 + 2.1 * nearEnd)
}

type PendingSimAction =
  | { type: 'skyjoSwapDrawn'; gridIndex: number }
  | { type: 'skyjoDumpDraw'; flipIndex: number }

/**
 * If this pending swap/dump would finish the grid (Skyjo), estimate expected extra cumulative
 * damage from being doubled when not lowest (round duplicate), weighted by match standing.
 */
function pendingActionFinisherPenalty(
  table: TableState,
  templates: Record<string, CardTemplate>,
  playerIndex: number,
  pending: CardInstance,
  action: PendingSimAction,
  pCount: number,
  evUnknown: number,
  cumulative: number,
  target: number,
  skyjoFinisher: number | null,
): number {
  if (skyjoFinisher !== null) return 0
  const t = cloneTable(table)
  ensureSlotTemplate(t.templates)
  const tpl = t.templates
  const g = t.zones[gridZone(playerIndex)]!.cards
  const pend = structuredClone(pending)
  pend.faceUp = true

  if (action.type === 'skyjoSwapDrawn') {
    const i = action.gridIndex
    const old = g[i]!
    const oldCl = structuredClone(old)
    g[i] = pend
    pushDiscard(t, oldCl)
  } else {
    const i = action.flipIndex
    const targetCell = g[i]!
    if (!targetCell || isSlot(targetCell.templateId) || targetCell.faceUp) return 0
    pushDiscard(t, structuredClone(pend))
    targetCell.faceUp = true
  }

  for (let k = 0; k < 8; k++) {
    const cm = clearMatchingColumns(t, playerIndex, tpl)
    if (!cm) break
  }

  if (!allNonSlotFaceUp(t, playerIndex)) return 0

  const myRaw = roundScoreForPlayer(t, tpl, playerIndex)
  let minOther = Infinity
  for (let op = 0; op < pCount; op++) {
    if (op === playerIndex) continue
    minOther = Math.min(minOther, estimatedRoundScoreForPlayer(table, op, templates, evUnknown))
  }
  if (!Number.isFinite(minOther)) minOther = evUnknown * 6

  return expectedFinisherDoublePain(myRaw, minOther, cumulative, target)
}

function starterFromOpening(table: TableState, templates: Record<string, CardTemplate>, pCount: number): number {
  let best = -Infinity
  let leader = 0
  for (let p = 0; p < pCount; p++) {
    let sum = 0
    for (const i of [0, 1]) {
      const c = table.zones[gridZone(p)]!.cards[i]
      if (c) sum += cardValue(templates, c.templateId)
    }
    if (sum > best) {
      best = sum
      leader = p
    }
  }
  return leader
}

function othersAfterSkyjo(finisher: number, pCount: number): number[] {
  const o: number[] = []
  for (let k = 1; k < pCount; k++) {
    o.push((finisher + k) % pCount)
  }
  return o
}

function ensureSlotTemplate(templates: Record<string, CardTemplate>): void {
  templates[SLOT] = { id: SLOT, value: 0, label: '', skyjo: true }
}

export interface SkyjoGameState {
  phase: 'play' | 'final' | 'roundOver'
  playerCount: number
  currentPlayer: number
  message: string
  pendingDraw: CardInstance | null
  /** If the pending card came from the discard pile it must be placed (no dump). */
  pendingFromDiscard: boolean
  skyjoFinisher: number | null
  finalQueue: number[]
  roundScores: number[] | null
  finisherDoubled: boolean
  /**
   * House rule: the discard pile may only be taken to swap onto face-up grid cards
   * (face-down cells accept deck draws only).
   */
  discardSwapFaceUpOnly: boolean
  /** House rule: shuffle discard into draw when draw is empty (except visible top discard). */
  reshuffleDiscardWhenDrawEmpty: boolean
}

function buildLegalActions(table: TableState, gs: SkyjoGameState): GameAction[] {
  if (gs.phase === 'roundOver') return []
  const p = gs.currentPlayer
  if (gs.phase === 'final' && gs.finalQueue.length > 0 && gs.finalQueue[0] !== p) return []

  if (gs.pendingDraw) {
    const actions: GameAction[] = []
    const g = table.zones[gridZone(p)]!.cards
    for (let i = 0; i < GRID; i++) {
      if (gs.pendingFromDiscard && gs.discardSwapFaceUpOnly) {
        const c = g[i]
        if (!c || isSlot(c.templateId) || !c.faceUp) continue
      }
      actions.push({ type: 'skyjoSwapDrawn', gridIndex: i })
    }
    if (!gs.pendingFromDiscard) {
      for (let i = 0; i < GRID; i++) {
        const c = g[i]
        if (c && !isSlot(c.templateId) && !c.faceUp) {
          actions.push({ type: 'skyjoDumpDraw', flipIndex: i })
        }
      }
    }
    return actions
  }

  const actions: GameAction[] = []
  if (isDeckDrawAvailableAfterOptionalRecycle(table, gs.reshuffleDiscardWhenDrawEmpty, true)) {
    actions.push({ type: 'skyjoDraw', from: 'deck' })
  }
  if (table.zones.discard!.cards.length > 0) {
    const g = table.zones[gridZone(p)]!.cards
    for (let i = 0; i < GRID; i++) {
      if (gs.discardSwapFaceUpOnly) {
        const c = g[i]
        if (!c || isSlot(c.templateId) || !c.faceUp) continue
      }
      actions.push({ type: 'skyjoTakeDiscard', gridIndex: i })
    }
  }
  return actions
}

function selectAiSkyjo(
  table: TableState,
  gameState: SkyjoGameState,
  playerIndex: number,
  rng: () => number,
  context: SelectAiContext,
  legal: GameAction[],
): GameAction {
  const { difficulty, matchCumulativeScores, matchTargetScore } = context
  const myCum = matchCumulativeScores?.[playerIndex] ?? 0
  const matchTarget = matchTargetScore ?? 100
  const templates = table.templates
  const g = table.zones[gridZone(playerIndex)]!.cards

  const takeDiscardAction = (): GameAction => {
    const take = legal.find((a) => a.type === 'skyjoTakeDiscard')
    return take ?? { type: 'skyjoTakeDiscard', gridIndex: 0 }
  }

  /** Lower score is better (estimated increase to grid sum, minus bonuses). */
  const bestPendingActionHard = (): GameAction => {
    const pv = cardValue(templates, gameState.pendingDraw!.templateId)
    const pCount = gameState.playerCount
    const comp = remainingUnknownComposition(table, templates, pCount)
    const evUnknown = expectedUnknownCardValue(comp.counts, comp.total)
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
      score += finishPen * 0.62
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
      const swapIsStrong = Number.isFinite(minSwapDelta) && minSwapDelta <= -2

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
        const adjRank = rank - fpen * 0.95
        if (adjRank > dumpRank) {
          dumpRank = adjRank
          bestDump = a
          dumpFpen = fpen
        }
      }

      if (!swapIsStrong) {
        const giftPv = maxDiscardPlacementMerit(table, nextP, templates, pv)
        const useDump =
          pv >= 10 ||
          (pv >= 8 && minSwapDelta >= 0) ||
          (pv >= 6 && minSwapDelta >= 1.5) ||
          (pv >= 5 && minSwapDelta >= 3)
        const dumpFeedsNext = pv <= 4 && giftPv > 2.25
        const dumpTooRisky = dumpFpen * 0.62 > 14 && minSwapDelta <= 2
        if (useDump && !dumpFeedsNext && !dumpTooRisky) {
          return bestDump
        }
        if (useDump && dumpFeedsNext && pv >= 9 && !dumpTooRisky) {
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

  const noPendingHard = (): GameAction => {
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
      takeMerit += giftNextIfWeDraw * 0.42
      const red = rediscardPressureForValue(dv, comp.counts, comp.total, avgPrev)
      takeMerit -= red * 2.8
      if (dv <= 2) return takeDiscardAction()
      if (takeMerit >= drawMerit + 0.25 && dv <= evUnknown + 1.2) return takeDiscardAction()
      if (dv <= 4 && takeMerit >= -0.5) return takeDiscardAction()
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

  if (gameState.pendingDraw) {
    if (difficulty === 'easy' && rng() < 0.4) {
      const swaps = legal.filter((a) => a.type === 'skyjoSwapDrawn')
      const dumps = legal.filter((a) => a.type === 'skyjoDumpDraw')
      const pool = [...swaps, ...dumps]
      if (pool.length > 0) return pool[Math.floor(rng() * pool.length)]!
    }
    if (difficulty === 'hard') return bestPendingActionHard()
    return pendingActionMedium()
  }

  if (difficulty === 'easy' && rng() < 0.35 && table.zones.draw!.cards.length > 0) {
    return { type: 'skyjoDraw', from: 'deck' }
  }

  if (difficulty === 'hard') {
    return noPendingHard()
  }

  if (difficulty === 'easy' && rng() < 0.42) {
    return legal[Math.floor(rng() * legal.length)]!
  }

  return noPendingMedium()
}

/** Face-up all real cards so the table matches scoring and the UI can show values after round over. */
function revealAllCardsForRoundScoring(table: TableState, pCount: number): void {
  for (let p = 0; p < pCount; p++) {
    const g = table.zones[gridZone(p)]?.cards
    if (!g) continue
    for (const c of g) {
      if (c && !isSlot(c.templateId)) c.faceUp = true
    }
  }
  const draw = table.zones.draw?.cards
  if (draw) for (const c of draw) c.faceUp = true
  const disc = table.zones.discard?.cards
  if (disc) for (const c of disc) c.faceUp = true
}

function scoreRoundState(
  table: TableState,
  templates: Record<string, CardTemplate>,
  pCount: number,
  finisher: number,
): Pick<SkyjoGameState, 'roundScores' | 'finisherDoubled' | 'message' | 'phase'> {
  revealAllCardsForRoundScoring(table, pCount)
  const raw: number[] = []
  for (let p = 0; p < pCount; p++) {
    raw.push(roundScoreForPlayer(table, templates, p))
  }
  const min = Math.min(...raw)
  let doubled = false
  const scores = [...raw]
  if (raw[finisher]! > min && raw[finisher]! > 0) {
    scores[finisher] = raw[finisher]! * 2
    doubled = true
  }
  const roundLine = scores.map((s, p) => `${playerSeatLabel(p)} ${s}`).join(' · ')
  return {
    phase: 'roundOver',
    roundScores: scores,
    finisherDoubled: doubled,
    message: `Round over.${doubled ? ` ${playerSeatLabel(finisher)} doubled (not lowest).` : ''} This round: ${roundLine}.`,
  }
}

const skyjoModule: GameModule<SkyjoGameState> = {
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

    for (let p = 0; p < pCount; p++) {
      const g = table.zones[gridZone(p)]!.cards
      for (const idx of [0, 1]) {
        const c = g[idx]
        if (c) c.faceUp = true
      }
    }

    const first = starterFromOpening(table, merged, pCount)

    return {
      table,
      gameState: {
        phase: 'play',
        playerCount: pCount,
        currentPlayer: first,
        message: `${first === 0 ? 'You start' : `${playerSeatLabel(first)} starts`} (highest sum of two opening cards). Draw or take discard.`,
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
          message: `${playerSeatLabel(nx)}'s turn.`,
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
    return selectAiSkyjo(table, gameState, playerIndex, rng, context, legal)
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
}

registerGameModule(skyjoModule)
