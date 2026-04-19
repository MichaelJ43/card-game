import type { AiDifficulty } from '../../core/aiContext'
import type { ApplyResult, GameModule, GameModuleContext, SelectAiContext } from '../../core/gameModule'
import type { CardInstance, GameAction, GameManifestYaml } from '../../core/types'
import type { CardTemplate } from '../../core/types'
import { playerSeatLabel } from '../../core/playerLabels'
import { registerGameModule } from '../../core/registry'
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

function recycleDiscardIfDrawEmpty(table: TableState, rng: () => number): void {
  const draw = table.zones.draw!.cards
  if (draw.length > 0) return
  const disc = table.zones.discard!.cards
  if (disc.length <= 1) return
  const top = disc.pop()!
  const rest = disc.splice(0, disc.length)
  shuffleInPlace(rest, rng)
  draw.push(...rest)
  disc.length = 0
  disc.push(top)
}

function columnIndices(c: number): [number, number, number] {
  return [c, c + COLS, c + 2 * COLS]
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
}

function buildLegalActions(table: TableState, gs: SkyjoGameState): GameAction[] {
  if (gs.phase === 'roundOver') return []
  const p = gs.currentPlayer
  if (gs.phase === 'final' && gs.finalQueue.length > 0 && gs.finalQueue[0] !== p) return []

  if (gs.pendingDraw) {
    const actions: GameAction[] = []
    for (let i = 0; i < GRID; i++) {
      actions.push({ type: 'skyjoSwapDrawn', gridIndex: i })
    }
    if (!gs.pendingFromDiscard) {
      const g = table.zones[gridZone(p)]!.cards
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
  if (table.zones.draw!.cards.length > 0) {
    actions.push({ type: 'skyjoDraw', from: 'deck' })
  }
  if (table.zones.discard!.cards.length > 0) {
    for (let i = 0; i < GRID; i++) {
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
  difficulty: AiDifficulty,
  legal: GameAction[],
): GameAction {
  const templates = table.templates

  const mediumPending = (): GameAction => {
    const pv = cardValue(templates, gameState.pendingDraw!.templateId)
    const g = table.zones[gridZone(playerIndex)]!.cards
    let bestSwap = 0
    let bestScore = -Infinity
    for (let i = 0; i < GRID; i++) {
      const c = g[i]
      if (!c || isSlot(c.templateId)) continue
      const oldv = cardValue(templates, c.templateId)
      const gain = pv - (c.faceUp ? oldv : 0)
      if (gain > bestScore) {
        bestScore = gain
        bestSwap = i
      }
    }
    const dumpTh = difficulty === 'hard' ? 6 : difficulty === 'easy' ? 12 : 8
    if (!gameState.pendingFromDiscard && pv > dumpTh) {
      const faceDownIdx = g.findIndex((c) => c && !isSlot(c.templateId) && !c.faceUp)
      if (faceDownIdx >= 0) {
        return { type: 'skyjoDumpDraw', flipIndex: faceDownIdx }
      }
    }
    return { type: 'skyjoSwapDrawn', gridIndex: bestSwap }
  }

  const mediumNoPending = (): GameAction => {
    const disc = topDiscard(table)
    const dv = disc ? cardValue(table.templates, disc.templateId) : 999
    const takeMax = difficulty === 'hard' ? 4 : 2
    if (disc && dv <= takeMax) {
      return { type: 'skyjoTakeDiscard', gridIndex: Math.floor(rng() * GRID) }
    }
    if (table.zones.draw!.cards.length > 0) {
      return { type: 'skyjoDraw', from: 'deck' }
    }
    if (disc) {
      return { type: 'skyjoTakeDiscard', gridIndex: Math.floor(rng() * GRID) }
    }
    return legal[Math.floor(rng() * legal.length)]!
  }

  if (gameState.pendingDraw) {
    if (difficulty === 'easy' && rng() < 0.4) {
      const swaps = legal.filter((a) => a.type === 'skyjoSwapDrawn')
      const dumps = legal.filter((a) => a.type === 'skyjoDumpDraw')
      const pool = [...swaps, ...dumps]
      if (pool.length > 0) return pool[Math.floor(rng() * pool.length)]!
    }
    return mediumPending()
  }

  if (difficulty === 'easy' && rng() < 0.35 && table.zones.draw!.cards.length > 0) {
    return { type: 'skyjoDraw', from: 'deck' }
  }

  if (difficulty === 'hard') {
    return mediumNoPending()
  }

  if (difficulty === 'easy' && rng() < 0.42) {
    return legal[Math.floor(rng() * legal.length)]!
  }

  return mediumNoPending()
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

    recycleDiscardIfDrawEmpty(t, rngFn)

    const gs = gameState

    const endTurn = (next: Partial<SkyjoGameState>, finished: number): ApplyResult<SkyjoGameState> => {
      recycleDiscardIfDrawEmpty(t, rngFn)
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
      recycleDiscardIfDrawEmpty(t, rngFn)
      const drawn = popTopDraw(t)
      if (!drawn) {
        recycleDiscardIfDrawEmpty(t, rngFn)
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
    return selectAiSkyjo(table, gameState, playerIndex, rng, context.difficulty, legal)
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
