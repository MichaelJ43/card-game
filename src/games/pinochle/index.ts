import type { AiDifficulty } from '../../core/aiContext'
import type { GameModule, SelectAiContext } from '../../core/gameModule'
import { newInstanceId } from '../../core/deck'
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
  let best = -1
  let bestP = trick[0]!.player
  for (const pl of trick) {
    const p = trickPower(templates, pl.templateId, trump, ls)
    if (p > best) {
      best = p
      bestP = pl.player
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

export interface PinochleGameState {
  phase: 'play' | 'done'
  currentPlayer: number
  trumpSuit: string
  trick: { player: number; templateId: string }[]
  tricksWon: number[]
  tricksPlayed: number
  message: string
  roundScores: number[] | null
}

/** 2-player pinochle: heads-up trick logic (no partner feeding). */
function selectPinochleTrickIndex(
  templates: Record<string, CardTemplate>,
  gs: PinochleGameState,
  playerIndex: number,
  hand: CardInstance[],
  legalIdx: number[],
  rng: () => number,
  d: AiDifficulty,
): number {
  const trump = gs.trumpSuit
  const trick = gs.trick
  const leadSuit0 =
    trick.length > 0
      ? String(
          (templates[trick[0]!.templateId] as { suit?: string } | undefined)?.suit ?? '',
        )
      : ''

  if (legalIdx.length === 0) return 0
  if (legalIdx.length === 1) return legalIdx[0]!

  if (d === 'easy' && rng() < 0.38) {
    return legalIdx[Math.floor(rng() * legalIdx.length)]!
  }
  if (d === 'medium' && rng() < 0.22) {
    return legalIdx[Math.floor(rng() * legalIdx.length)]!
  }

  if (trick.length === 1) {
    const scored = legalIdx.map((i) => {
      const tid = hand[i]!.templateId
      const winner = resolveTrick(templates, [...trick, { player: playerIndex, templateId: tid }], trump)
      const p = trickPower(templates, tid, trump, leadSuit0)
      return { i, winner, p }
    })
    const weWin = scored.filter((x) => x.winner === playerIndex)
    if (weWin.length > 0) {
      const m = Math.min(...weWin.map((x) => x.p))
      const pool = weWin.filter((x) => x.p === m)
      if (d === 'expert' && weWin.length > 1 && rng() < 0.11) {
        const oth = [...weWin].sort((a, b) => a.p - b.p)
        if (oth[1]) return oth[1]!.i
      }
      return pool[Math.floor(rng() * pool.length)]!.i
    }
    return scored.sort((a, b) => a.p - b.p)[0]!.i
  }

  if (trick.length === 0) {
    if (d === 'medium' && rng() < 0.25) {
      return legalIdx[Math.floor(rng() * legalIdx.length)]!
    }
    const scored = legalIdx.map((i) => {
      const tid = hand[i]!.templateId
      const ls = String(templates[tid]?.suit ?? '')
      return { i, p: trickPower(templates, tid, trump, ls) }
    })
    const nts = scored.filter((s) => String(templates[hand[s.i]!.templateId]!.suit) !== trump)
    const use = nts.length > 0 ? nts : scored
    return use.sort((a, b) => a.p - b.p)[0]!.i
  }

  return legalIdx.sort(
    (a, b) =>
      trickPower(templates, hand[a]!.templateId, trump, leadSuit0) -
      trickPower(templates, hand[b]!.templateId, trump, leadSuit0),
  )[0]!
}

const pinochleModule: GameModule<PinochleGameState> = {
  moduleId: 'pinochle',

  setup(ctx, instances) {
    const pCount = totalPlayers(ctx.manifest)
    if (pCount !== 2) throw new Error('This Pinochle table is 2-player only.')
    const rng = mulberry32(Math.floor(ctx.rng() * 0xffffffff))
    const doubled: CardInstance[] = instances.flatMap((c) => [
      { instanceId: newInstanceId(), templateId: c.templateId, faceUp: false },
      { instanceId: newInstanceId(), templateId: c.templateId, faceUp: false },
    ])
    shuffleInPlace(doubled, rng)

    const zoneIds = ['draw', 'trump', 'trick', ...Array.from({ length: pCount }, (_, i) => handId(i))]
    const table = createEmptyTable(ctx.templates, zoneIds, [
      { id: 'draw', kind: 'stack', defaultFaceUp: false },
      { id: 'trump', kind: 'stack', defaultFaceUp: true },
      { id: 'trick', kind: 'spread', defaultFaceUp: true },
      ...Array.from({ length: pCount }, (_, i) => ({
        id: handId(i),
        kind: 'spread' as const,
        defaultFaceUp: false,
        owner: i,
      })),
    ])
    for (const c of doubled) {
      table.zones.draw!.cards.push(c)
    }
    for (let r = 0; r < 12; r++) {
      for (let p = 0; p < pCount; p++) {
        const c = moveTop(table, 'draw', handId(p), p === 0)
        if (c) c.faceUp = p === 0
      }
    }
    const tr = moveTop(table, 'draw', 'trump', true)
    const trumpSuit =
      tr && typeof ctx.templates[tr.templateId]?.suit === 'string'
        ? (ctx.templates[tr.templateId]!.suit as string)
        : 'spades'

    return {
      table,
      gameState: {
        phase: 'play',
        currentPlayer: 0,
        trumpSuit,
        trick: [],
        tricksWon: [0, 0],
        tricksPlayed: 0,
        message: `Trump ${trumpSuit}. Twelve tricks — you lead.`,
        roundScores: null,
      },
    }
  },

  getLegalActions(table, gs) {
    if (gs.phase !== 'play' || gs.currentPlayer !== 0) return []
    const hand = table.zones['hand:0']!.cards
    const idxs = legalPlays(table.templates, hand, gs.trick)
    return idxs.map((i) => ({ type: 'custom', payload: { cmd: 'pncPlay', index: i } }) as GameAction)
  },

  applyAction(table, gs, action) {
    const t = cloneTable(table)
    const pCount = 2

    if (action.type !== 'custom' || cmd(action.payload) !== 'pncPlay') {
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
          message: `Trick ${trick.length}/2 — opponent.`,
        },
      }
    }

    const winner = resolveTrick(t.templates, trick, gs.trumpSuit)
    const tricksWon = [...gs.tricksWon]
    tricksWon[winner] = (tricksWon[winner] ?? 0) + 1
    t.zones.trick!.cards.splice(0, t.zones.trick!.cards.length)
    const tricksPlayed = gs.tricksPlayed + 1

    if (tricksPlayed >= 12) {
      return {
        table: t,
        gameState: {
          ...gs,
          trick: [],
          tricksWon,
          tricksPlayed,
          phase: 'done',
          currentPlayer: winner,
          message: `Hand done — tricks ${tricksWon[0]}–${tricksWon[1]}.`,
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
        message: `Player ${winner + 1} leads.`,
      },
    }
  },

  selectAiAction(table, gs, playerIndex, rng, context: SelectAiContext) {
    if (gs.phase !== 'play' || playerIndex !== gs.currentPlayer) return null
    const hand = table.zones[handId(playerIndex)]!.cards
    const idxs = legalPlays(table.templates, hand, gs.trick)
    if (!idxs.length) return null
    const i = selectPinochleTrickIndex(
      table.templates,
      gs,
      playerIndex,
      hand,
      idxs,
      rng,
      context.difficulty,
    )
    return { type: 'custom', payload: { cmd: 'pncPlay', index: i } }
  },

  statusText(_table, gs) {
    if (gs.phase === 'done') return gs.message
    const y = gs.tricksWon[0] ?? 0
    return `${gs.message} Your tricks: ${y}/${12}.`
  },

  extractMatchRoundScores(gs) {
    return gs.roundScores
  },

  isMatchRoundFinished(gs) {
    return gs.phase === 'done' && gs.roundScores !== null
  },
}

registerGameModule(pinochleModule)
