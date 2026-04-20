import { recycleDiscardIntoDrawWhenEmpty } from '../../core/discardRecycle'
import type { ApplyResult, GameModule, GameModuleContext } from '../../core/gameModule'
import type { CardTemplate, GameAction, GameManifestYaml } from '../../core/types'
import { registerGameModule } from '../../core/registry'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveTop } from '../../core/table'
import { rankOrder } from '../standard/cardUtils'

function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

function stacksFrom(ctx: GameModuleContext, n: number): number[] {
  if (ctx.matchCumulativeScores?.length === n) return [...ctx.matchCumulativeScores]
  const v = ctx.manifest.match?.startingStack ?? 100
  return Array.from({ length: n }, () => (typeof v === 'number' && v > 0 ? v : 100))
}

function handRank(templates: Record<string, CardTemplate>, ids: string[]): number[] {
  return ids.map((id) => rankOrder(templates, id)).sort((a, b) => b - a)
}

function compare5(templates: Record<string, CardTemplate>, a: string[], b: string[]): number {
  const ha = handRank(templates, a)
  const hb = handRank(templates, b)
  for (let i = 0; i < 5; i++) {
    if (ha[i] !== hb[i]) return ha[i]! - hb[i]!
  }
  return 0
}

export interface PokerDrawGameState {
  phase: 'bet' | 'draw' | 'done'
  stacks: [number, number]
  ante: number
  roundDelta: [number, number] | null
  message: string
  reshuffleDiscardWhenDrawEmpty: boolean
}

const pokerDrawModule: GameModule<PokerDrawGameState> = {
  moduleId: 'poker-draw',

  setup(ctx, instances) {
    const pCount = totalPlayers(ctx.manifest)
    if (pCount !== 2) throw new Error('5-card draw module is heads-up (2 players).')
    const rng = mulberry32(Math.floor(ctx.rng() * 0xffffffff))
    const table = createEmptyTable(ctx.templates, ['draw', 'discard', 'hand:0', 'hand:1'], [
      { id: 'draw', kind: 'stack', defaultFaceUp: false },
      { id: 'discard', kind: 'stack', defaultFaceUp: true },
      { id: 'hand:0', kind: 'spread', defaultFaceUp: true, owner: 0 },
      { id: 'hand:1', kind: 'spread', defaultFaceUp: false, owner: 1 },
    ])
    shuffleInPlace(instances, rng)
    for (const c of instances) {
      c.faceUp = false
      table.zones.draw!.cards.push(c)
    }
    const stacks = stacksFrom(ctx, 2) as [number, number]
    return {
      table,
      gameState: {
        phase: 'bet',
        stacks,
        ante: 10,
        roundDelta: null,
        message: 'Ante 10 chips. Then replace 0–3 cards from the front of your hand (same count for both). Highest rank wins the pot.',
        reshuffleDiscardWhenDrawEmpty: ctx.reshuffleDiscardWhenDrawEmpty ?? false,
      },
    }
  },

  getLegalActions(_table, gs) {
    if (gs.phase === 'bet') {
      const a = gs.ante
      if (gs.stacks[0]! < a || gs.stacks[1]! < a) return []
      return [{ type: 'custom', payload: { cmd: 'p5Ante' } }]
    }
    if (gs.phase === 'draw') {
      const out: GameAction[] = []
      for (let k = 0; k <= 3; k++) {
        out.push({ type: 'custom', payload: { cmd: 'p5Draw', count: k } })
      }
      return out
    }
    return []
  },

  applyAction(table, gs, action): ApplyResult<PokerDrawGameState> {
    const t = cloneTable(table)
    const templates = t.templates
    if (action.type !== 'custom') return { table: t, gameState: gs, error: 'Unsupported.' }
    const c = cmd(action.payload)

    if (gs.phase === 'bet' && c === 'p5Ante') {
      const a = gs.ante
      if (gs.stacks[0]! < a || gs.stacks[1]! < a) {
        return { table: t, gameState: gs, error: 'Cannot cover ante.' }
      }
      const afterAnte: [number, number] = [gs.stacks[0]! - a, gs.stacks[1]! - a]
      t.zones['hand:0']!.cards.length = 0
      t.zones['hand:1']!.cards.length = 0
      t.zones.discard!.cards.length = 0
      for (let i = 0; i < 5; i++) {
        moveTop(t, 'draw', 'hand:0', true)
        moveTop(t, 'draw', 'hand:1', false)
      }
      for (const c of t.zones['hand:1']!.cards) c.faceUp = false
      return {
        table: t,
        gameState: {
          ...gs,
          phase: 'draw',
          stacks: afterAnte,
          message: 'How many cards to replace (0–3)? Same count is applied to both hands.',
          reshuffleDiscardWhenDrawEmpty: gs.reshuffleDiscardWhenDrawEmpty,
        },
      }
    }

    if (gs.phase === 'draw' && c === 'p5Draw') {
      const count = Math.min(3, Math.max(0, Number((action.payload as { count?: number }).count)))
      recycleDiscardIntoDrawWhenEmpty(t, () => Math.random(), {
        enabled: gs.reshuffleDiscardWhenDrawEmpty,
        preserveTopDiscard: true,
      })
      const drawPile = t.zones.draw!.cards
      if (count * 2 > drawPile.length) {
        return { table: t, gameState: gs, error: 'Not enough cards to replace that many.' }
      }
      for (let p = 0; p < 2; p++) {
        const hz = t.zones[`hand:${p}`]!.cards
        const toDiscard = hz.splice(0, count)
        for (const card of toDiscard) {
          card.faceUp = true
          t.zones.discard!.cards.push(card)
        }
        for (let i = 0; i < count; i++) {
          const nc = moveTop(t, 'draw', `hand:${p}`, p === 0)
          if (nc) nc.faceUp = p === 0
        }
      }
      const p0 = t.zones['hand:0']!.cards.map((c) => c.templateId)
      const p1 = t.zones['hand:1']!.cards.map((c) => c.templateId)
      for (const c of t.zones['hand:1']!.cards) c.faceUp = true
      const cmp = compare5(templates, p0, p1)
      const a = gs.ante
      const base0 = gs.stacks[0]!
      const base1 = gs.stacks[1]!
      const preAnte0 = base0 + a
      const preAnte1 = base1 + a
      let s0 = base0
      let s1 = base1
      let message = ''
      if (cmp > 0) {
        s0 = base0 + 2 * a
        s1 = base1 - a
        message = 'You win the pot.'
      } else if (cmp < 0) {
        s0 = base0 - a
        s1 = base1 + 2 * a
        message = 'Opponent wins the pot.'
      } else {
        s0 = preAnte0
        s1 = preAnte1
        message = 'Tie — antes returned.'
      }
      return {
        table: t,
        gameState: {
          phase: 'done',
          stacks: [s0, s1],
          ante: gs.ante,
          roundDelta: [s0 - preAnte0, s1 - preAnte1],
          message,
          reshuffleDiscardWhenDrawEmpty: gs.reshuffleDiscardWhenDrawEmpty,
        },
      }
    }

    return { table: t, gameState: gs, error: 'Illegal.' }
  },

  selectAiAction(): GameAction | null {
    return null
  },

  statusText(_t, gs) {
    return gs.message
  },

  extractMatchRoundScores(gs) {
    return gs.phase === 'done' && gs.roundDelta ? [...gs.roundDelta] : null
  },

  isMatchRoundFinished(gs) {
    return gs.phase === 'done' && gs.roundDelta !== null
  },
}

registerGameModule(pokerDrawModule)
