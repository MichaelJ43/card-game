import type { AiDifficulty } from '../../core/aiContext'
import { aiIsHardOrExpert } from '../../core/aiPlaystyle'
import type { ApplyResult, GameModule, SelectAiContext } from '../../core/gameModule'
import type { CardTemplate, GameAction, GameManifestYaml } from '../../core/types'
import { registerGameModule } from '../../core/registry'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveTop } from '../../core/table'
import type { TableState } from '../../core/types'

function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

function handId(i: number): string {
  return `hand:${i}`
}

function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

function cardValue(templates: Record<string, CardTemplate>, templateId: string): number {
  const v = templates[templateId]?.value
  return typeof v === 'number' ? v : -1
}

function canPlayOnPile(piles: number[], pileIndex: number, v: number): boolean {
  const need = piles[pileIndex]!
  if (v === 0) return true
  return v === need
}

function advancePile(piles: number[], pileIndex: number, v: number): void {
  const need = piles[pileIndex]!
  if (v !== 0 && v !== need) return
  piles[pileIndex] = need >= 12 ? 1 : need + 1
}

function legalPlays(
  table: TableState,
  piles: number[],
  playerIndex: number,
): GameAction[] {
  const hand = table.zones[handId(playerIndex)]!.cards
  const out: GameAction[] = []
  for (let i = 0; i < hand.length; i++) {
    const v = cardValue(table.templates, hand[i]!.templateId)
    if (v < 0) continue
    for (let p = 0; p < 4; p++) {
      if (canPlayOnPile(piles, p, v)) {
        out.push({ type: 'custom', payload: { cmd: 'srPlay', handIndex: i, pileIndex: p } })
      }
    }
  }
  return out
}

function drawToFive(t: TableState, playerIndex: number): void {
  const hand = t.zones[handId(playerIndex)]!.cards
  while (hand.length < 5 && t.zones.draw!.cards.length > 0) {
    const c = moveTop(t, 'draw', handId(playerIndex), playerIndex === 0)
    if (c) c.faceUp = playerIndex === 0
  }
}

export interface SequenceRaceGameState {
  phase: 'play' | 'done'
  currentPlayer: number
  piles: [number, number, number, number]
  message: string
  roundScores: number[] | null
}

const sequenceRaceModule: GameModule<SequenceRaceGameState> = {
  moduleId: 'sequence-race',

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

  selectAiAction(table, gs, playerIndex, rng, context: SelectAiContext) {
    if (gs.phase !== 'play' || playerIndex !== gs.currentPlayer) return null
    const d: AiDifficulty = context.difficulty
    const plays = legalPlays(table, gs.piles, playerIndex)
    if (plays.length > 0) {
      if (d === 'easy' && rng() < 0.35) {
        return plays[Math.floor(rng() * plays.length)]!
      }
      if (d === 'medium' && rng() < 0.22) {
        return plays[Math.floor(rng() * plays.length)]!
      }
      if (aiIsHardOrExpert(d)) {
        const score = (a: (typeof plays)[0]): number => {
          if (a.type !== 'custom' || cmd(a.payload) !== 'srPlay') return -100
          const pi = Number((a.payload as { pileIndex?: number }).pileIndex)
          const hi = Number((a.payload as { handIndex?: number }).handIndex)
          const v = cardValue(table.templates, table.zones[handId(playerIndex)]!.cards[hi]!.templateId)
          const need = gs.piles[pi]!
          if (v !== 0 && v !== need) return -200
          let s = 40
          s += (13 - need) * 0.5
          if (d === 'expert' && rng() < 0.1) s -= 4
          return s
        }
        const ranked = plays.map((a) => ({ a, s: score(a) })).sort((x, y) => y.s - x.s)
        if (d === 'expert' && ranked.length > 1 && rng() < 0.12) return ranked[1]!.a
        return ranked[0]!.a
      }
      return plays[Math.floor(rng() * plays.length)]!
    }
    return { type: 'custom', payload: { cmd: 'srEndTurn' } }
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

registerGameModule(sequenceRaceModule)
