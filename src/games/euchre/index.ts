import type { GameModule, SelectAiContext } from '../../core/gameModule'
import type { CardInstance, CardTemplate, GameAction, GameManifestYaml } from '../../core/types'
import { registerGameModule } from '../../core/registry'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveCard, moveTop } from '../../core/table'

const RANK_ORDER = ['9', '10', 'J', 'Q', 'K', 'A'] as const

function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

function handId(i: number): string {
  return `hand:${i}`
}

function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

function rankIdx(rank: string | undefined): number {
  if (!rank) return -1
  return RANK_ORDER.indexOf(rank as (typeof RANK_ORDER)[number])
}

function trickPower(
  templates: Record<string, CardTemplate>,
  templateId: string,
  trump: string,
  leadSuit: string,
): number {
  const t = templates[templateId]
  const suit = typeof t?.suit === 'string' ? t.suit : ''
  const r = typeof t?.rank === 'string' ? t.rank : ''
  const ri = rankIdx(r)
  const isTrump = suit === trump
  const followsLead = suit === leadSuit
  if (isTrump) return 200 + ri
  if (followsLead) return 100 + ri
  return ri
}

function resolveTrick(
  templates: Record<string, CardTemplate>,
  trick: { player: number; templateId: string }[],
  trump: string,
): number {
  const leadSuit = templates[trick[0]!.templateId]?.suit
  const ls = typeof leadSuit === 'string' ? leadSuit : ''
  let best = 0
  let bestP = trick[0]!.player
  for (let i = 0; i < trick.length; i++) {
    const p = trickPower(templates, trick[i]!.templateId, trump, ls)
    if (p > best) {
      best = p
      bestP = trick[i]!.player
    }
  }
  return bestP
}

function hasSuit(hand: CardInstance[], templates: Record<string, CardTemplate>, suit: string): boolean {
  return hand.some((c) => templates[c.templateId]?.suit === suit)
}

function legalPlays(
  templates: Record<string, CardTemplate>,
  hand: CardInstance[],
  trick: { player: number; templateId: string }[],
): number[] {
  if (trick.length === 0) {
    return hand.map((_, i) => i)
  }
  const leadT = templates[trick[0]!.templateId]
  const leadSuit = typeof leadT?.suit === 'string' ? leadT.suit : ''
  const mustFollow = hasSuit(hand, templates, leadSuit)
  const out: number[] = []
  hand.forEach((c, i) => {
    const s = templates[c.templateId]?.suit
    if (!mustFollow || s === leadSuit) out.push(i)
  })
  return out
}

export interface EuchreGameState {
  phase: 'play' | 'done'
  currentPlayer: number
  trumpSuit: string
  trick: { player: number; templateId: string }[]
  tricksWon: number[]
  tricksPlayed: number
  message: string
  roundScores: number[] | null
}

const euchreModule: GameModule<EuchreGameState> = {
  moduleId: 'euchre',

  setup(ctx, instances) {
    const pCount = totalPlayers(ctx.manifest)
    if (pCount !== 4) throw new Error('This Euchre table expects 4 players.')
    const rng = mulberry32(Math.floor(ctx.rng() * 0xffffffff))
    const zoneIds = ['draw', 'turn', 'trick', ...Array.from({ length: pCount }, (_, i) => handId(i))]
    const table = createEmptyTable(ctx.templates, zoneIds, [
      { id: 'draw', kind: 'stack', defaultFaceUp: false },
      { id: 'turn', kind: 'stack', defaultFaceUp: true },
      { id: 'trick', kind: 'spread', defaultFaceUp: true },
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
    for (let r = 0; r < 5; r++) {
      for (let p = 0; p < pCount; p++) {
        const c = moveTop(table, 'draw', handId(p), p === 0)
        if (c) c.faceUp = p === 0
      }
    }
    const turnC = moveTop(table, 'draw', 'turn', true)
    const trumpSuit =
      turnC && typeof ctx.templates[turnC.templateId]?.suit === 'string'
        ? (ctx.templates[turnC.templateId]!.suit as string)
        : 'spades'

    return {
      table,
      gameState: {
        phase: 'play',
        currentPlayer: 0,
        trumpSuit,
        trick: [],
        tricksWon: Array.from({ length: pCount }, () => 0),
        tricksPlayed: 0,
        message: `Trump is ${trumpSuit}. Player 1 leads.`,
        roundScores: null,
      },
    }
  },

  getLegalActions(table, gs) {
    if (gs.phase !== 'play' || gs.currentPlayer !== 0) return []
    const hand = table.zones['hand:0']!.cards
    const idxs = legalPlays(table.templates, hand, gs.trick)
    return idxs.map((i) => ({ type: 'custom', payload: { cmd: 'echPlay', index: i } }) as GameAction)
  },

  applyAction(table, gs, action) {
    const t = cloneTable(table)
    const pCount = Object.keys(t.zones).filter((id) => /^hand:\d+$/.test(id)).length

    if (action.type !== 'custom' || cmd(action.payload) !== 'echPlay') {
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
          message: `Trick ${trick.length}/${pCount} — Player ${((cur + 1) % pCount) + 1}.`,
        },
      }
    }

    const winner = resolveTrick(t.templates, trick, gs.trumpSuit)
    const tricksWon = [...gs.tricksWon]
    tricksWon[winner] = (tricksWon[winner] ?? 0) + 1
    t.zones.trick!.cards.splice(0, t.zones.trick!.cards.length)
    const tricksPlayed = gs.tricksPlayed + 1

    if (tricksPlayed >= 5) {
      const best = tricksWon.indexOf(Math.max(...tricksWon))
      return {
        table: t,
        gameState: {
          ...gs,
          trick: [],
          tricksWon,
          tricksPlayed,
          phase: 'done',
          currentPlayer: winner,
          message: `Hand finished. Most tricks: Player ${best + 1} (${Math.max(...tricksWon)}).`,
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
        message: `Player ${winner + 1} takes the trick and leads.`,
      },
    }
  },

  selectAiAction(table, gs, playerIndex, rng, context: SelectAiContext) {
    void context
    if (gs.phase !== 'play' || playerIndex !== gs.currentPlayer) return null
    const hand = table.zones[handId(playerIndex)]!.cards
    const idxs = legalPlays(table.templates, hand, gs.trick)
    if (!idxs.length) return null
    const i = idxs[Math.floor(rng() * idxs.length)]!
    return { type: 'custom', payload: { cmd: 'echPlay', index: i } }
  },

  statusText(_table, gs) {
    if (gs.phase === 'done') return gs.message
    const y = gs.tricksWon[0] ?? 0
    return `${gs.message} Trump: ${gs.trumpSuit}. Your tricks: ${y}.`
  },

  extractMatchRoundScores(gs) {
    return gs.roundScores
  },

  isMatchRoundFinished(gs) {
    return gs.phase === 'done' && gs.roundScores !== null
  },
}

registerGameModule(euchreModule)
