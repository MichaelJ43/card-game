import type { CardInstance, GameAction, GameManifestYaml } from '../../core/types'
import type { CardTemplate } from '../../core/types'
import type { ApplyResult, GameModule, GameModuleContext, SelectAiContext } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { shuffleCards } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveTop } from '../../core/table'
import type { TableState } from '../../core/types'

function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

function handId(p: number): string {
  return `hand:${p}`
}

function booksId(p: number): string {
  return `books:${p}`
}

function rankOf(templates: Record<string, CardTemplate>, templateId: string): string {
  const r = templates[templateId]?.rank
  return typeof r === 'string' ? r : '?'
}

function setHandCardVisibility(_table: TableState, playerIndex: number, card: CardInstance): void {
  card.faceUp = playerIndex === 0
}

function removeAllOfRank(
  hand: CardInstance[],
  templates: Record<string, CardTemplate>,
  rank: string,
): CardInstance[] {
  const kept: CardInstance[] = []
  const out: CardInstance[] = []
  for (const c of hand) {
    if (rankOf(templates, c.templateId) === rank) out.push(c)
    else kept.push(c)
  }
  hand.length = 0
  hand.push(...kept)
  return out
}

/** Lay down complete books (4 of a rank) from hand into books zone */
function layBooksFromHand(
  table: TableState,
  playerIndex: number,
  templates: Record<string, CardTemplate>,
): number {
  const hz = table.zones[handId(playerIndex)]!.cards
  const byRank = new Map<string, CardInstance[]>()
  for (const c of hz) {
    const r = rankOf(templates, c.templateId)
    if (!byRank.has(r)) byRank.set(r, [])
    byRank.get(r)!.push(c)
  }
  let newBooks = 0
  const bz = table.zones[booksId(playerIndex)]!.cards
  for (const [, cards] of byRank) {
    if (cards.length >= 4) {
      const take = cards.slice(0, 4)
      const takeIds = new Set(take.map((c) => c.instanceId))
      const remaining = hz.filter((c) => !takeIds.has(c.instanceId))
      hz.length = 0
      hz.push(...remaining)
      for (const c of take) {
        c.faceUp = true
        bz.push(c)
      }
      newBooks += 1
    }
  }
  return newBooks
}

function handCardCount(table: TableState, p: number): number {
  return table.zones[handId(p)]?.cards.length ?? 0
}

function drawCount(table: TableState): number {
  return table.zones.draw?.cards.length ?? 0
}

function totalCardsInBooks(table: TableState, playerCount: number): number {
  let n = 0
  for (let p = 0; p < playerCount; p++) {
    n += table.zones[booksId(p)]?.cards.length ?? 0
  }
  return n
}

function replenishIfEmpty(
  table: TableState,
  playerIndex: number,
  templates: Record<string, CardTemplate>,
): void {
  const hz = table.zones[handId(playerIndex)]!.cards
  while (hz.length === 0 && drawCount(table) > 0) {
    const c = moveTop(table, 'draw', handId(playerIndex), true)
    if (c) {
      setHandCardVisibility(table, playerIndex, c)
      layBooksFromHand(table, playerIndex, templates)
    }
  }
}

function countRankInHand(
  hz: CardInstance[],
  templates: Record<string, CardTemplate>,
  rank: string,
): number {
  let n = 0
  for (const c of hz) {
    if (rankOf(templates, c.templateId) === rank) n++
  }
  return n
}

/** Higher = stronger ask (closer to a book, fish a larger hand). */
function scoreGoFishAsk(
  action: GameAction,
  table: TableState,
  templates: Record<string, CardTemplate>,
  currentPlayer: number,
): number {
  if (action.type !== 'goFishAsk') return -Infinity
  const { targetPlayer, rank } = action
  const my = countRankInHand(table.zones[handId(currentPlayer)]!.cards, templates, rank)
  const theirHand = table.zones[handId(targetPlayer)]!.cards.length
  return my * 20 + theirHand * 3
}

function enumerateLegalAsks(
  table: TableState,
  templates: Record<string, CardTemplate>,
  currentPlayer: number,
  playerCount: number,
): GameAction[] {
  const hz = table.zones[handId(currentPlayer)]!.cards
  const ranks = new Set<string>()
  for (const c of hz) {
    ranks.add(rankOf(templates, c.templateId))
  }
  const actions: GameAction[] = []
  for (const rank of ranks) {
    for (let t = 0; t < playerCount; t++) {
      if (t === currentPlayer) continue
      actions.push({ type: 'goFishAsk', targetPlayer: t, rank })
    }
  }
  return actions
}

function isGameOver(table: TableState, playerCount: number): boolean {
  if (totalCardsInBooks(table, playerCount) >= 52) return true
  if (drawCount(table) > 0) return false
  for (let p = 0; p < playerCount; p++) {
    if (handCardCount(table, p) > 0) return false
  }
  return true
}

function scoreBooks(table: TableState, playerCount: number): number[] {
  const scores: number[] = []
  for (let p = 0; p < playerCount; p++) {
    const n = table.zones[booksId(p)]?.cards.length ?? 0
    scores.push(Math.floor(n / 4))
  }
  return scores
}

function finalizeIfOver(
  t: TableState,
  pCount: number,
  message: string,
  bookCounts: number[],
): GoFishGameState | null {
  if (!isGameOver(t, pCount)) return null
  const scores = bookCounts
  let best = -1
  const winners: number[] = []
  scores.forEach((s, i) => {
    if (s > best) {
      best = s
      winners.length = 0
      winners.push(i)
    } else if (s === best) {
      winners.push(i)
    }
  })
  const winMsg =
    winners.length === 1
      ? `Game over. Player ${winners[0]} wins with ${best} book(s).`
      : `Game over. Tie at ${best} book(s): ${winners.join(', ')}.`
  return {
    phase: 'over',
    playerCount: pCount,
    currentPlayer: 0,
    message: `${message} ${winMsg}`,
    winnerIndex: winners.length === 1 ? winners[0]! : null,
    bookCounts,
  }
}

export interface GoFishGameState {
  phase: 'playing' | 'over'
  playerCount: number
  currentPlayer: number
  message: string
  winnerIndex: number | null
  bookCounts: number[]
}

function advanceToPlayableOrEnd(
  table: TableState,
  startPlayer: number,
  playerCount: number,
  templates: Record<string, CardTemplate>,
  priorMessage: string,
): GoFishGameState {
  let p = startPlayer
  let guard = 0
  while (guard++ <= playerCount + 2) {
    replenishIfEmpty(table, p, templates)
    if (handCardCount(table, p) > 0 || drawCount(table) > 0) {
      const bookCounts = scoreBooks(table, playerCount)
      const done = finalizeIfOver(table, playerCount, priorMessage, bookCounts)
      if (done) return done
      return {
        phase: 'playing',
        playerCount,
        currentPlayer: p,
        message: `${priorMessage} Player ${p}'s turn.`,
        winnerIndex: null,
        bookCounts,
      }
    }
    p = (p + 1) % playerCount
  }

  const bookCounts = scoreBooks(table, playerCount)
  const done = finalizeIfOver(table, playerCount, priorMessage, bookCounts)
  if (done) return done

  return {
    phase: 'playing',
    playerCount,
    currentPlayer: startPlayer,
    message: priorMessage,
    winnerIndex: null,
    bookCounts,
  }
}

const goFishModule: GameModule<GoFishGameState> = {
  moduleId: 'go-fish',

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

  selectAiAction(table, gameState, playerIndex, rng, context: SelectAiContext) {
    if (gameState.phase === 'over') return null
    if (gameState.currentPlayer !== playerIndex) return null
    const sim = cloneTable(table)
    replenishIfEmpty(sim, playerIndex, sim.templates)
    const legal = enumerateLegalAsks(sim, sim.templates, playerIndex, gameState.playerCount)
    if (legal.length === 0) return { type: 'goFishPass' }

    const { difficulty } = context
    if (difficulty === 'medium') {
      return legal[Math.floor(rng() * legal.length)]!
    }

    const templates = sim.templates
    const scored = legal.map((a) => ({
      a,
      s: a.type === 'goFishAsk' ? scoreGoFishAsk(a, sim, templates, playerIndex) : 0,
    }))

    if (difficulty === 'hard') {
      const maxS = Math.max(...scored.map((x) => x.s))
      const top = scored.filter((x) => x.s === maxS)
      return top[Math.floor(rng() * top.length)]!.a
    }

    // easy: prefer weaker asks; mix in random mistakes
    const minS = Math.min(...scored.map((x) => x.s))
    const weak = scored.filter((x) => x.s === minS)
    if (rng() < 0.58) {
      return weak[Math.floor(rng() * weak.length)]!.a
    }
    return legal[Math.floor(rng() * legal.length)]!
  },

  statusText(table, gameState) {
    const books = scoreBooks(table, gameState.playerCount).join(' | ')
    return `${gameState.message} — Books per player: ${books}`
  },
}

registerGameModule(goFishModule)
