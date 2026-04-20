import type { ApplyResult, GameModule, SelectAiContext } from '../../core/gameModule'
import type { CardTemplate, GameAction, GameManifestYaml } from '../../core/types'
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

  selectAiAction(table, gs, playerIndex, rng, _ctx: SelectAiContext): GameAction | null {
    if (gs.phase !== 'play' || gs.currentPlayer !== playerIndex) return null
    const top = topDiscard(table)
    if (!top) return null
    const hz = table.zones[handId(playerIndex)]!.cards
    const legalIdx: number[] = []
    hz.forEach((c, i) => {
      if (canPlay(table.templates, c.templateId, top, gs.currentSuit)) legalIdx.push(i)
    })
    if (legalIdx.length > 0) {
      const pick = legalIdx[Math.floor(rng() * legalIdx.length)]!
      const card = hz[pick]!
      if (table.templates[card.templateId]?.rank === '8') {
        const s = SUITS[Math.floor(rng() * 4)]!
        return { type: 'custom', payload: { cmd: 'c8Play', index: pick, suit: s } }
      }
      return { type: 'custom', payload: { cmd: 'c8Play', index: pick } }
    }
    if (isDeckDrawAvailableAfterOptionalRecycle(table, gs.reshuffleDiscardWhenDrawEmpty, true)) {
      return { type: 'custom', payload: { cmd: 'c8Draw' } }
    }
    return null
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
