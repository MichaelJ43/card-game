import type { CardInstance, GameAction, GameManifestYaml } from '../../core/types'
import type { CardTemplate } from '../../core/types'
import { moveTop } from '../../core/table'
import type { TableState } from '../../core/types'
import type { GoFishGameState } from './types'

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

/** Expert: one-card-from-a-book, table politics, and avoid fishing empty seats. */
function scoreGoFishAskExpert(
  action: GameAction,
  table: TableState,
  templates: Record<string, CardTemplate>,
  currentPlayer: number,
): number {
  if (action.type !== 'goFishAsk') return -Infinity
  const { targetPlayer, rank } = action
  const hz = table.zones[handId(currentPlayer)]!.cards
  const my = countRankInHand(hz, templates, rank)
  const theirHand = table.zones[handId(targetPlayer)]!.cards.length
  let s = scoreGoFishAsk(action, table, templates, currentPlayer)
  if (my === 3) s += 120
  else if (my === 2) s += 32
  if (theirHand <= 1) s -= 45
  else s += theirHand * 1.2
  return s
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

export {
  totalPlayers,
  handId,
  booksId,
  rankOf,
  setHandCardVisibility,
  removeAllOfRank,
  layBooksFromHand,
  handCardCount,
  drawCount,
  totalCardsInBooks,
  replenishIfEmpty,
  countRankInHand,
  scoreGoFishAsk,
  scoreGoFishAskExpert,
  enumerateLegalAsks,
  isGameOver,
  scoreBooks,
  finalizeIfOver,
  advanceToPlayableOrEnd,
}
