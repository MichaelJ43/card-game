import { recycleDiscardIntoDrawWhenEmpty, isDeckDrawAvailableAfterOptionalRecycle } from '../../core/discardRecycle'
import type { ApplyResult, GameModule, SelectAiContext } from '../../core/gameModule'
import { newInstanceId } from '../../core/deck'
import type { CardInstance, GameAction, GameManifestYaml } from '../../core/types'
import { registerGameModule } from '../../core/registry'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveTop } from '../../core/table'

function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

function handId(i: number): string {
  return `hand:${i}`
}

function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

function isJokerTemplate(id: string): boolean {
  return id.startsWith('joker')
}

export interface CanastaGameState {
  phase: 'play' | 'done'
  currentPlayer: number
  drewThisTurn: boolean
  message: string
  roundScores: number[] | null
  reshuffleDiscardWhenDrawEmpty: boolean
}

const canastaModule: GameModule<CanastaGameState> = {
  moduleId: 'canasta',

  setup(ctx, instances) {
    const pCount = totalPlayers(ctx.manifest)
    if (pCount !== 2) throw new Error('This Canasta practice table is 2-player only.')
    const rng = mulberry32(Math.floor(ctx.rng() * 0xffffffff))
    const std = instances.filter((c) => !isJokerTemplate(c.templateId))
    const jokers = instances.filter((c) => isJokerTemplate(c.templateId))
    const doubled: CardInstance[] = [
      ...std.map((c) => ({ instanceId: newInstanceId(), templateId: c.templateId, faceUp: false })),
      ...std.map((c) => ({ instanceId: newInstanceId(), templateId: c.templateId, faceUp: false })),
      ...jokers.map((c) => ({ instanceId: newInstanceId(), templateId: c.templateId, faceUp: false })),
    ]
    shuffleInPlace(doubled, rng)

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
    for (const c of doubled) {
      table.zones.draw!.cards.push(c)
    }
    for (let r = 0; r < 11; r++) {
      for (let p = 0; p < pCount; p++) {
        const c = moveTop(table, 'draw', handId(p), p === 0)
        if (c) c.faceUp = p === 0
      }
    }
    moveTop(table, 'draw', 'discard', true)

    return {
      table,
      gameState: {
        phase: 'play',
        currentPlayer: 0,
        drewThisTurn: false,
        message: 'Draw two from stock, then discard one to end your turn. Empty your hand to win the round.',
        roundScores: null,
        reshuffleDiscardWhenDrawEmpty: ctx.reshuffleDiscardWhenDrawEmpty ?? false,
      },
    }
  },

  getLegalActions(table, gs) {
    if (gs.phase !== 'play' || gs.currentPlayer !== 0) return []
    if (!gs.drewThisTurn) {
      if (!isDeckDrawAvailableAfterOptionalRecycle(table, gs.reshuffleDiscardWhenDrawEmpty, true)) {
        const hz = table.zones['hand:0']!.cards
        return hz.map((_, i) => ({ type: 'custom', payload: { cmd: 'cnsDiscard', index: i } }) as GameAction)
      }
      return [{ type: 'custom', payload: { cmd: 'cnsDrawTwo' } }]
    }
    const hz = table.zones['hand:0']!.cards
    return hz.map((_, i) => ({ type: 'custom', payload: { cmd: 'cnsDiscard', index: i } }) as GameAction)
  },

  applyAction(table, gs, action) {
    const t = cloneTable(table)
    const pCount = 2

    const finish = (winner: number): ApplyResult<CanastaGameState> => {
      const rs = [0, 0]
      rs[winner] = 1
      return {
        table: t,
        gameState: {
          ...gs,
          phase: 'done',
          message: `Round over — Player ${winner + 1} went out.`,
          roundScores: rs,
        },
      }
    }

    if (gs.phase !== 'play') return { table: t, gameState: gs, error: 'Round over.' }

    if (action.type !== 'custom') return { table: t, gameState: gs, error: 'Unknown action.' }
    const command = cmd(action.payload)
    const cur = gs.currentPlayer

    if (command === 'cnsDrawTwo') {
      if (cur !== gs.currentPlayer) return { table: t, gameState: gs, error: 'Not your turn.' }
      if (gs.drewThisTurn) return { table: t, gameState: gs, error: 'Already drew.' }
      recycleDiscardIntoDrawWhenEmpty(t, () => Math.random(), {
        enabled: gs.reshuffleDiscardWhenDrawEmpty,
        preserveTopDiscard: true,
      })
      const stock = t.zones.draw!.cards.length
      if (stock === 0) return { table: t, gameState: gs, error: 'Stock empty — discard only.' }
      const n = Math.min(2, stock)
      for (let i = 0; i < n; i++) {
        const c = moveTop(t, 'draw', handId(cur), cur === 0)
        if (c) c.faceUp = cur === 0
      }
      return {
        table: t,
        gameState: { ...gs, drewThisTurn: true, message: 'Choose a card to discard.' },
      }
    }

    if (command === 'cnsDiscard') {
      if (cur !== gs.currentPlayer) return { table: t, gameState: gs, error: 'Not your turn.' }
      const ix = Number((action.payload as { index?: unknown }).index)
      const hand = t.zones[handId(cur)]!.cards
      if (!Number.isInteger(ix) || ix < 0 || ix >= hand.length) return { table: t, gameState: gs, error: 'Bad card.' }

      if (!gs.drewThisTurn && t.zones.draw!.cards.length > 0) {
        return { table: t, gameState: gs, error: 'Draw two first.' }
      }

      const card = hand.splice(ix, 1)[0]!
      card.faceUp = true
      t.zones.discard!.cards.push(card)

      if (hand.length === 0) {
        return finish(cur)
      }

      return {
        table: t,
        gameState: {
          ...gs,
          currentPlayer: (cur + 1) % pCount,
          drewThisTurn: false,
          message: `Player ${((cur + 1) % pCount) + 1} — draw two, then discard.`,
        },
      }
    }

    return { table: t, gameState: gs, error: 'Unknown action.' }
  },

  selectAiAction(table, gs, playerIndex, rng, context: SelectAiContext) {
    void context
    if (gs.phase !== 'play' || playerIndex !== gs.currentPlayer) return null
    if (!gs.drewThisTurn) {
      if (isDeckDrawAvailableAfterOptionalRecycle(table, gs.reshuffleDiscardWhenDrawEmpty, true)) {
        return { type: 'custom', payload: { cmd: 'cnsDrawTwo' } }
      }
    }
    const hand = table.zones[handId(playerIndex)]!.cards
    if (!hand.length) return null
    const i = Math.floor(rng() * hand.length)
    return { type: 'custom', payload: { cmd: 'cnsDiscard', index: i } }
  },

  statusText(table, gs) {
    if (gs.phase === 'done') return gs.message
    const h = table.zones['hand:0']!.cards.length
    return `${gs.message} Your hand: ${h} cards. Stock: ${table.zones.draw!.cards.length}.`
  },

  extractMatchRoundScores(gs) {
    return gs.roundScores
  },

  isMatchRoundFinished(gs) {
    return gs.phase === 'done' && gs.roundScores !== null
  },
}

registerGameModule(canastaModule)
