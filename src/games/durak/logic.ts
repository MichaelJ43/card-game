import type { ApplyResult, GameModule } from '../../core/gameModule'
import type { GameAction } from '../../core/types'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveCard, moveTop } from '../../core/table'
import { canBeat, checkWin, cmd, handId, refillHands, totalPlayers } from './helpers'
import type { DurakGameState } from './types'

export const durakLogic: Pick<
  GameModule<DurakGameState>,
  'setup' | 'getLegalActions' | 'applyAction' | 'statusText' | 'extractMatchRoundScores' | 'isMatchRoundFinished'
> = {
  setup(ctx, instances) {
    const pCount = totalPlayers(ctx.manifest)
    if (pCount !== 2) throw new Error('This Durak table is 2-player only.')
    const rng = mulberry32(Math.floor(ctx.rng() * 0xffffffff))
    const zoneIds = ['draw', 'trump', 'battle', 'waste', ...Array.from({ length: pCount }, (_, i) => handId(i))]
    const table = createEmptyTable(ctx.templates, zoneIds, [
      { id: 'draw', kind: 'stack', defaultFaceUp: false },
      { id: 'trump', kind: 'stack', defaultFaceUp: true },
      { id: 'battle', kind: 'spread', defaultFaceUp: true },
      { id: 'waste', kind: 'stack', defaultFaceUp: false },
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
    for (let r = 0; r < 6; r++) {
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
        attacker: 0,
        defender: 1,
        sub: 'attack',
        trumpSuit,
        message: `Trump: ${trumpSuit}. You attack first — play a card to the battle.`,
        roundScores: null,
      },
    }
  },

  getLegalActions(table, gs) {
    if (gs.phase !== 'play' || gs.currentPlayer !== 0) return []
    if (gs.sub === 'attack') {
      const hz = table.zones['hand:0']!.cards
      return hz.map((_, i) => ({ type: 'custom', payload: { cmd: 'dukAttack', index: i } }) as GameAction)
    }
    const battle = table.zones.battle!.cards
    if (battle.length !== 1) return []
    const attackTid = battle[0]!.templateId
    const hz = table.zones['hand:0']!.cards
    const out: GameAction[] = []
    out.push({ type: 'custom', payload: { cmd: 'dukTake' } })
    hz.forEach((card, i) => {
      if (canBeat(table.templates, attackTid, card.templateId, gs.trumpSuit)) {
        out.push({ type: 'custom', payload: { cmd: 'dukDefend', index: i } })
      }
    })
    return out
  },

  applyAction(table, gs, action) {
    const t = cloneTable(table)
    const pCount = 2

    const finish = (winner: number, msg: string): ApplyResult<DurakGameState> => {
      const rs = [0, 0]
      rs[winner] = 1
      return {
        table: t,
        gameState: {
          ...gs,
          phase: 'done',
          message: msg,
          roundScores: rs,
        },
      }
    }

    if (gs.phase !== 'play') return { table: t, gameState: gs, error: 'Round over.' }

    const turn = gs.currentPlayer
    if (action.type !== 'custom') return { table: t, gameState: gs, error: 'Unknown action.' }
    const command = cmd(action.payload)

    if (command === 'dukAttack') {
      if (gs.sub !== 'attack' || turn !== gs.attacker) return { table: t, gameState: gs, error: 'Not attacking now.' }
      const ix = Number((action.payload as { index?: unknown }).index)
      const hand = t.zones[handId(gs.attacker)]!.cards
      if (!Number.isInteger(ix) || ix < 0 || ix >= hand.length) return { table: t, gameState: gs, error: 'Bad card.' }
      if (t.zones.battle!.cards.length !== 0) return { table: t, gameState: gs, error: 'Battle not empty.' }
      const card = hand[ix]!
      moveCard(t, handId(gs.attacker), card.instanceId, 'battle', { faceUp: true })
      return {
        table: t,
        gameState: {
          ...gs,
          sub: 'defend',
          currentPlayer: gs.defender,
          message: `Defender must beat or take the card.`,
        },
      }
    }

    if (command === 'dukTake') {
      if (gs.sub !== 'defend' || turn !== gs.defender) return { table: t, gameState: gs, error: 'Not defending now.' }
      const battle = t.zones.battle!.cards
      if (battle.length !== 1) return { table: t, gameState: gs, error: 'Nothing to take.' }
      const card = battle.pop()!
      card.faceUp = gs.defender === 0
      t.zones[handId(gs.defender)]!.cards.push(card)
      refillHands(t, gs.attacker, pCount)
      const w = checkWin(t, pCount)
      if (w !== null) {
        const loser = 1 - w
        return finish(w, `Stock empty — Player ${w + 1} shed all cards. Player ${loser + 1} is the durak.`)
      }
      return {
        table: t,
        gameState: {
          ...gs,
          sub: 'attack',
          currentPlayer: gs.attacker,
          message: `Defender picked up. Player ${gs.attacker + 1} attacks again.`,
        },
      }
    }

    if (command === 'dukDefend') {
      if (gs.sub !== 'defend' || turn !== gs.defender) return { table: t, gameState: gs, error: 'Not defending now.' }
      const battle = t.zones.battle!.cards
      if (battle.length !== 1) return { table: t, gameState: gs, error: 'Nothing to beat.' }
      const attackTid = battle[0]!.templateId
      const ix = Number((action.payload as { index?: unknown }).index)
      const dHand = t.zones[handId(gs.defender)]!.cards
      if (!Number.isInteger(ix) || ix < 0 || ix >= dHand.length) return { table: t, gameState: gs, error: 'Bad card.' }
      const defCard = dHand[ix]!
      if (!canBeat(t.templates, attackTid, defCard.templateId, gs.trumpSuit))
        return { table: t, gameState: gs, error: 'Does not beat.' }
      moveCard(t, handId(gs.defender), defCard.instanceId, 'battle', { faceUp: true })
      const a = battle.shift()!
      const d = battle.pop()!
      t.zones.waste!.cards.push(a, d)
      const newAttacker = gs.defender
      const newDefender = gs.attacker
      refillHands(t, newAttacker, pCount)
      const w = checkWin(t, pCount)
      if (w !== null) {
        const loser = 1 - w
        return finish(w, `Stock empty — Player ${w + 1} shed all cards. Player ${loser + 1} is the durak.`)
      }
      return {
        table: t,
        gameState: {
          ...gs,
          attacker: newAttacker,
          defender: newDefender,
          sub: 'attack',
          currentPlayer: newAttacker,
          message: `Defense wins — Player ${newAttacker + 1} attacks.`,
        },
      }
    }

    return { table: t, gameState: gs, error: 'Unknown action.' }
  },

  statusText(_table, gs) {
    if (gs.phase === 'done') return gs.message
    const ct = gs.currentPlayer
    return `${gs.message} (${gs.sub}, player ${ct + 1} to act).`
  },

  extractMatchRoundScores(gs) {
    return gs.roundScores
  },

  isMatchRoundFinished(gs) {
    return gs.phase === 'done' && gs.roundScores !== null
  },
}
