import type { AiDifficulty } from '../../core/aiContext'
import { aiIsExpert } from '../../core/aiPlaystyle'
import type { ApplyResult, GameModule, SelectAiContext } from '../../core/gameModule'
import type { CardInstance, CardTemplate, GameAction, GameManifestYaml } from '../../core/types'
import { registerGameModule } from '../../core/registry'
import { recycleDiscardIntoDrawWhenEmpty, isDeckDrawAvailableAfterOptionalRecycle } from '../../core/discardRecycle'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveTop } from '../../core/table'
import type { TableState } from '../../core/types'

function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

function handId(i: number): string {
  return `hand:${i}`
}

export interface Crazy8sGameState {
  phase: 'play' | 'roundOver'
  currentPlayer: number
  currentSuit: string
  message: string
  roundScores: number[] | null
  reshuffleDiscardWhenDrawEmpty: boolean
}

function topDiscard(table: TableState): { templateId: string } | null {
  const d = table.zones.discard?.cards
  const c = d?.[d.length - 1]
  return c ? { templateId: c.templateId } : null
}

function canPlay(
  templates: Record<string, CardTemplate>,
  cardId: string,
  top: { templateId: string },
  suit: string,
): boolean {
  const t = templates[cardId]
  const topT = templates[top.templateId]
  if (t?.rank === '8') return true
  if (t?.rank === topT?.rank) return true
  if (t?.suit === suit || t?.suit === topT?.suit) return true
  return false
}

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const

function rankC8Strength(rank: string | undefined): number {
  if (!rank) return 0
  if (rank === 'A') return 14
  if (rank === 'K') return 13
  if (rank === 'Q') return 12
  if (rank === 'J') return 11
  if (rank === '8') return 0
  const n = Number(rank)
  return Number.isFinite(n) ? n : 0
}

function enumerateCrazy8Plays(
  table: TableState,
  gs: Crazy8sGameState,
  playerIndex: number,
): GameAction[] {
  const top = topDiscard(table)
  if (!top) return []
  const hz = table.zones[handId(playerIndex)]!.cards
  const out: GameAction[] = []
  hz.forEach((c, i) => {
    if (canPlay(table.templates, c.templateId, top, gs.currentSuit)) {
      if (table.templates[c.templateId]?.rank === '8') {
        for (const s of SUITS) {
          out.push({ type: 'custom', payload: { cmd: 'c8Play', index: i, suit: s } })
        }
      } else {
        out.push({ type: 'custom', payload: { cmd: 'c8Play', index: i } })
      }
    }
  })
  if (isDeckDrawAvailableAfterOptionalRecycle(table, gs.reshuffleDiscardWhenDrawEmpty, true)) {
    out.push({ type: 'custom', payload: { cmd: 'c8Draw' } })
  }
  return out
}

function bestSuitOnEight(
  _table: TableState,
  hand: CardInstance[],
  playIndex: number,
  templates: Record<string, CardTemplate>,
  rng: () => number,
  d: AiDifficulty,
): (typeof SUITS)[number] {
  const rem = hand.filter((_, j) => j !== playIndex)
  const countBySuit = (s: string) =>
    rem.filter((c) => (templates[c.templateId]?.suit as string | undefined) === s).length
  const scored = SUITS.map((s) => ({ s, n: countBySuit(s) })).sort((a, b) => b.n - a.n)
  if (d === 'easy' || d === 'medium') return scored[Math.floor(rng() * scored.length)]!.s
  if (d === 'hard') return scored[0]!.s
  if (aiIsExpert(d) && rng() < 0.14 && scored.length > 1) return scored[1]!.s
  return scored[0]!.s
}

const crazy8sModule: GameModule<Crazy8sGameState> = {
  moduleId: 'crazy-eights',

  setup(ctx, instances) {
    const pCount = totalPlayers(ctx.manifest)
    if (pCount < 2 || pCount > 4) throw new Error('Crazy Eights needs 2–4 players.')
    const rng = mulberry32(Math.floor(ctx.rng() * 0xffffffff))
    const zoneIds = ['draw', 'discard', ...Array.from({ length: pCount }, (_, i) => handId(i))]
    const table = createEmptyTable(ctx.templates, zoneIds, [
      { id: 'draw', kind: 'stack', defaultFaceUp: false },
      { id: 'discard', kind: 'stack', defaultFaceUp: true },
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
    const handSize = 5
    for (let r = 0; r < handSize; r++) {
      for (let p = 0; p < pCount; p++) {
        const c = moveTop(table, 'draw', handId(p), p === 0)
        if (c) c.faceUp = p === 0
      }
    }
    let starter = moveTop(table, 'draw', 'discard', true)
    let guard = 0
    while (starter && ctx.templates[starter.templateId]?.rank === '8' && guard++ < 52) {
      table.zones.discard!.cards.pop()
      table.zones.draw!.cards.unshift(starter)
      starter = moveTop(table, 'draw', 'discard', true)
    }
    if (!starter) throw new Error('Deck error.')
    const topT = ctx.templates[starter.templateId]
    const suit = typeof topT?.suit === 'string' ? topT.suit : 'spades'
    return {
      table,
      gameState: {
        phase: 'play',
        currentPlayer: 0,
        currentSuit: suit,
        message: 'Play a card matching rank or suit, or an 8.',
        roundScores: null,
        reshuffleDiscardWhenDrawEmpty: ctx.reshuffleDiscardWhenDrawEmpty ?? false,
      },
    }
  },

  getLegalActions(table, gs) {
    if (gs.phase !== 'play' || gs.currentPlayer !== 0) return []
    const top = topDiscard(table)
    if (!top) return []
    const hz = table.zones['hand:0']!.cards
    const out: GameAction[] = []
    hz.forEach((c, i) => {
      if (canPlay(table.templates, c.templateId, top, gs.currentSuit)) {
        const needSuit = table.templates[c.templateId]?.rank === '8'
        if (needSuit) {
          for (const s of SUITS) {
            out.push({ type: 'custom', payload: { cmd: 'c8Play', index: i, suit: s } })
          }
        } else {
          out.push({ type: 'custom', payload: { cmd: 'c8Play', index: i } })
        }
      }
    })
    if (isDeckDrawAvailableAfterOptionalRecycle(table, gs.reshuffleDiscardWhenDrawEmpty, true)) {
      out.push({ type: 'custom', payload: { cmd: 'c8Draw' } })
    }
    return out
  },

  applyAction(table, gs, action): ApplyResult<Crazy8sGameState> {
    const t = cloneTable(table)
    const templates = t.templates
    if (action.type !== 'custom') return { table: t, gameState: gs, error: 'Unsupported.' }
    const c = cmd(action.payload)
    const cp = gs.currentPlayer
    const pCount = Object.keys(t.zones).filter((k) => k.startsWith('hand:')).length
    const hid = handId(cp)
    const hz = t.zones[hid]!.cards

    if (c === 'c8Draw') {
      const rng = () => Math.random()
      recycleDiscardIntoDrawWhenEmpty(t, rng, {
        enabled: gs.reshuffleDiscardWhenDrawEmpty,
        preserveTopDiscard: true,
      })
      if (t.zones.draw!.cards.length === 0) return { table: t, gameState: gs, error: 'Deck empty.' }
      moveTop(t, 'draw', hid, cp === 0)
      return {
        table: t,
        gameState: { ...gs, message: cp === 0 ? 'Drew a card.' : 'AI drew.' },
      }
    }

    if (c === 'c8Play') {
      const idx = Number((action.payload as { index?: number }).index)
      if (!Number.isFinite(idx) || idx < 0 || idx >= hz.length) {
        return { table: t, gameState: gs, error: 'Bad card.' }
      }
      const top = topDiscard(t)
      if (!top) return { table: t, gameState: gs, error: 'No discard.' }
      const card = hz[idx]!
      if (!canPlay(templates, card.templateId, top, gs.currentSuit)) {
        return { table: t, gameState: gs, error: 'Illegal play.' }
      }
      hz.splice(idx, 1)
      card.faceUp = true
      t.zones.discard!.cards.push(card)
      let suit = gs.currentSuit
      if (templates[card.templateId]?.rank === '8') {
        const declared = (action.payload as { suit?: string }).suit
        if (typeof declared === 'string' && SUITS.includes(declared as (typeof SUITS)[number])) {
          suit = declared
        }
      } else if (templates[card.templateId]?.suit) {
        suit = String(templates[card.templateId]?.suit)
      }
      if (hz.length === 0) {
        const scores = Array.from({ length: pCount }, (_, i) => (i === cp ? 1 : 0))
        return {
          table: t,
          gameState: {
            phase: 'roundOver',
            currentPlayer: cp,
            currentSuit: suit,
            roundScores: scores,
            message: `Player ${cp} went out!`,
            reshuffleDiscardWhenDrawEmpty: gs.reshuffleDiscardWhenDrawEmpty,
          },
        }
      }
      const next = (cp + 1) % pCount
      return {
        table: t,
        gameState: {
          ...gs,
          currentPlayer: next,
          currentSuit: suit,
          message: next === 0 ? 'Your turn.' : `Player ${next}'s turn.`,
        },
      }
    }

    return { table: t, gameState: gs, error: 'Unknown.' }
  },

  selectAiAction(table, gs, playerIndex, rng, context: SelectAiContext): GameAction | null {
    if (gs.phase !== 'play' || gs.currentPlayer !== playerIndex) return null
    const d = context.difficulty
    const tpl = table.templates
    const hz = table.zones[handId(playerIndex)]!.cards
    const actions = enumerateCrazy8Plays(table, gs, playerIndex)
    if (actions.length === 0) return null

    type CustomA = Extract<GameAction, { type: 'custom' }>
    const plays = actions.filter((a): a is CustomA => a.type === 'custom' && cmd(a.payload) === 'c8Play')
    const draws = actions.filter((a): a is CustomA => a.type === 'custom' && cmd(a.payload) === 'c8Draw')

    const hasPlay = plays.length > 0
    if (d === 'easy' && hasPlay && draws.length > 0 && rng() < 0.28) {
      return draws[0]!
    }

    if (!hasPlay) return draws[0] ?? null

    if (d === 'easy' || d === 'medium') {
      const a = plays[Math.floor(rng() * plays.length)]!
      const p = a.payload as { index?: number; suit?: string }
      const i = Number(p.index)
      const c = hz[i]!
      if (tpl[c.templateId]?.rank === '8') {
        const s = p.suit && SUITS.includes(p.suit as (typeof SUITS)[number]) ? p.suit : bestSuitOnEight(table, hz, i, tpl, rng, d)
        return { type: 'custom', payload: { cmd: 'c8Play', index: i, suit: s } }
      }
      return { type: 'custom', payload: { cmd: 'c8Play', index: i } }
    }

    const score = (a: CustomA): number => {
      const c0 = cmd(a.payload as Record<string, unknown>)
      if (c0 === 'c8Draw') return 5000
      const p = a.payload as { index?: number }
      const i = Number(p.index)
      const t = hz[i]!
      const r = tpl[t.templateId]?.rank
      if (r === '8') return 300
      return 1000 - rankC8Strength(r)
    }

    if (d === 'hard' || d === 'expert') {
      if (d === 'expert' && rng() < 0.12) {
        const eights = plays.filter((a) => {
          const i = Number((a.payload as { index?: number }).index)
          return tpl[hz[i]!.templateId]?.rank === '8'
        })
        const non8 = plays.filter((a) => {
          const i2 = Number((a.payload as { index?: number }).index)
          return tpl[hz[i2]!.templateId]?.rank !== '8'
        })
        if (eights.length > 0 && non8.length > 0 && rng() < 0.55) {
          const a = non8.sort((a, b) => score(a) - score(b))[0]!
          const p = a.payload as { index?: number }
          return { type: 'custom', payload: { cmd: 'c8Play', index: p.index } }
        }
      }
      const best = plays.slice().sort((a, b) => score(a) - score(b))[0]!
      const p = best.payload as { index?: number; suit?: string }
      const i = Number(p.index)
      if (tpl[hz[i]!.templateId]?.rank === '8') {
        const s = bestSuitOnEight(table, hz, i, tpl, rng, d)
        return { type: 'custom', payload: { cmd: 'c8Play', index: i, suit: s } }
      }
      return { type: 'custom', payload: { cmd: 'c8Play', index: i } }
    }
    return plays[0]!
  },

  statusText(_t, gs) {
    return gs.message
  },

  extractMatchRoundScores(gs) {
    return gs.phase === 'roundOver' && gs.roundScores ? [...gs.roundScores] : null
  },

  isMatchRoundFinished(gs) {
    return gs.phase === 'roundOver' && gs.roundScores !== null
  },
}

registerGameModule(crazy8sModule)
