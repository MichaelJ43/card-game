import type { CardInstance, GameAction, GameManifestYaml } from '../../core/types'
import type { CardTemplate } from '../../core/types'
import { playerSeatLabel } from '../../core/playerLabels'
import { recycleDiscardIntoDrawWhenEmpty, isDeckDrawAvailableAfterOptionalRecycle } from '../../core/discardRecycle'
import { cloneTable } from '../../core/table'
import type { TableState } from '../../core/types'
import type { SkyjoGameState } from './types'

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

/** Second moment; used to weight face-down “fuzzy” uncertainty. */
function varianceUnknownCard(counts: Record<number, number>, total: number): number {
  if (total <= 0) return 0
  const ev = expectedUnknownCardValue(counts, total)
  let e2 = 0
  for (const [k, n] of Object.entries(counts)) {
    if (n <= 0) continue
    const v = Number(k)
    e2 += v * v * (n / total)
  }
  return Math.max(0, e2 - ev * ev)
}

function probUnknownIsValue(counts: Record<number, number>, total: number, v: number): number {
  if (total <= 0) return 0
  return (counts[v] ?? 0) / total
}

function sumVisibleFaceUpOnGrid(
  table: TableState,
  playerIndex: number,
  templates: Record<string, CardTemplate>,
): number {
  let s = 0
  for (const c of table.zones[gridZone(playerIndex)]!.cards) {
    if (!c || isSlot(c.templateId) || !c.faceUp) continue
    s += cardValue(templates, c.templateId)
  }
  return s
}

/**
 * If two cards in a column are face up with the same value and the third is still hidden,
 * placing `pv` on the hidden discards a chance at a high triple when `pv` does not match.
 */
function expertClogLastHiddenInPairColumn(
  table: TableState,
  playerIndex: number,
  templates: Record<string, CardTemplate>,
  placeIdx: number,
  pv: number,
  expert: boolean,
): number {
  if (!expert) return 0
  const [a, b, d] = columnIndices(placeIdx % COLS)
  const g = table.zones[gridZone(playerIndex)]!.cards
  const idxs: number[] = [a, b, d]
  let hiddenIdx: number | null = null
  const face: { v: number; i: number }[] = []
  for (const i of idxs) {
    const c = g[i]
    if (!c || isSlot(c.templateId)) continue
    if (!c.faceUp) {
      if (hiddenIdx === null) hiddenIdx = i
      else return 0
      continue
    }
    face.push({ v: cardValue(templates, c.templateId), i })
  }
  if (face.length !== 2 || hiddenIdx === null) return 0
  if (face[0]!.v !== face[1]!.v) return 0
  if (placeIdx !== hiddenIdx) return 0
  const r = face[0]!.v
  if (pv === r) return 0
  return 4.5 + Math.max(0, r) * 0.5
}

/**
 * Swapping off a card that is part of a face-up pair, while the third column card is still hidden,
 * hurts odds of a future column triple—more so for higher pairs.
 */
function expertLoomingPairBreakPenalty(
  table: TableState,
  playerIndex: number,
  templates: Record<string, CardTemplate>,
  placeIdx: number,
  pv: number,
  expert: boolean,
): number {
  if (!expert) return 0
  const [a, b, d] = columnIndices(placeIdx % COLS)
  const g = table.zones[gridZone(playerIndex)]!.cards
  const col = [a, b, d].map((i) => g[i]!)
  if (col.some((c) => !c || isSlot(c.templateId))) return 0
  let hiddenN = 0
  for (const c of col) {
    if (!c.faceUp) hiddenN++
  }
  if (hiddenN !== 1) return 0
  const faceV: number[] = []
  for (const c of col) {
    if (c.faceUp) faceV.push(cardValue(templates, c.templateId))
  }
  if (faceV.length !== 2) return 0
  if (faceV[0] !== faceV[1]) return 0
  const r = faceV[0]!
  const cAt = g[placeIdx]!
  if (!cAt.faceUp || cardValue(templates, cAt.templateId) !== r) return 0
  if (pv === r) return 0
  return 5 + (r >= 6 ? r * 0.6 : 0)
}

/**
 * Slight “halo” toward a column triple: weight toward matching a lone face-up
 * (or a pair) using remaining-card P(value).
 */
function expertTripleCompletionHalo(
  table: TableState,
  playerIndex: number,
  placeIdx: number,
  pv: number,
  templates: Record<string, CardTemplate>,
  counts: Record<number, number>,
  total: number,
  expert: boolean,
): number {
  if (!expert) return 0
  const [a, b, d] = columnIndices(placeIdx % COLS)
  const g = table.zones[gridZone(playerIndex)]!.cards
  const peerVals: number[] = []
  for (const i of [a, b, d]) {
    if (i === placeIdx) continue
    const c = g[i]
    if (!c || isSlot(c.templateId) || !c.faceUp) continue
    peerVals.push(cardValue(templates, c.templateId))
  }
  if (peerVals.length === 2 && peerVals[0] === peerVals[1]) {
    const v = peerVals[0]!
    const p3 = probUnknownIsValue(counts, total, v)
    if (pv === v) return -2.2 * p3
    return 0
  }
  if (peerVals.length === 1) {
    const v = peerVals[0]!
    const p3 = probUnknownIsValue(counts, total, v)
    if (pv === v) return -1.0 * p3
    if (p3 > 0.12) {
      return -0.4 * p3 * Math.max(0, 8 - Math.abs(pv - v))
    }
  }
  return 0
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

function countFaceUpNonSlotOnGrid(table: TableState, playerIndex: number): number {
  let n = 0
  for (const c of table.zones[gridZone(playerIndex)]!.cards) {
    if (c && !isSlot(c.templateId) && c.faceUp) n++
  }
  return n
}

function sumOpeningVisibleOnGrid(
  table: TableState,
  templates: Record<string, CardTemplate>,
  playerIndex: number,
): number {
  let sum = 0
  for (const c of table.zones[gridZone(playerIndex)]!.cards) {
    if (!c || isSlot(c.templateId) || !c.faceUp) continue
    sum += cardValue(templates, c.templateId)
  }
  return sum
}

/** First player: highest sum of face-up starters (ties → lowest seat index wins). */
function starterFromOpening(table: TableState, templates: Record<string, CardTemplate>, pCount: number): number {
  let best = -Infinity
  let leader = 0
  for (let p = 0; p < pCount; p++) {
    const sum = sumOpeningVisibleOnGrid(table, templates, p)
    if (sum > best) {
      best = sum
      leader = p
    }
  }
  return leader
}

function allPlayersOpeningReady(table: TableState, pCount: number): boolean {
  for (let p = 0; p < pCount; p++) {
    if (countFaceUpNonSlotOnGrid(table, p) !== 2) return false
  }
  return true
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

function buildLegalActions(table: TableState, gs: SkyjoGameState): GameAction[] {
  if (gs.phase === 'roundOver') return []
  const p = gs.currentPlayer
  if (gs.phase === 'final' && gs.finalQueue.length > 0 && gs.finalQueue[0] !== p) return []

  if (gs.phase === 'opening') {
    const actions: GameAction[] = []
    const g = table.zones[gridZone(p)]!.cards
    if (countFaceUpNonSlotOnGrid(table, p) >= 2) return []
    for (let i = 0; i < GRID; i++) {
      const c = g[i]
      if (c && !isSlot(c.templateId) && !c.faceUp) {
        actions.push({ type: 'skyjoOpeningFlip', gridIndex: i })
      }
    }
    return actions
  }

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

export {
  GRID,
  COLS,
  totalPlayers,
  gridZone,
  cardValue,
  isSlot,
  topDiscard,
  popTopDraw,
  pushDiscard,
  recycleDiscardIfDrawEmpty,
  columnIndices,
  remainingUnknownComposition,
  expectedUnknownCardValue,
  varianceUnknownCard,
  sumVisibleFaceUpOnGrid,
  expertClogLastHiddenInPairColumn,
  expertLoomingPairBreakPenalty,
  expertTripleCompletionHalo,
  avgFaceUpOnGrid,
  rediscardPressureForValue,
  estimatedCellContribution,
  completesColumnTriple,
  maxDiscardPlacementMerit,
  clearMatchingColumns,
  roundScoreForPlayer,
  allNonSlotFaceUp,
  countFaceUpNonSlotOnGrid,
  starterFromOpening,
  allPlayersOpeningReady,
  othersAfterSkyjo,
  ensureSlotTemplate,
  buildLegalActions,
  scoreRoundState,
  pendingActionFinisherPenalty,
}
