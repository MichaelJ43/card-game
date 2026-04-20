import type { ApplyResult, GameModule, SelectAiContext } from '../../core/gameModule'
import type { CardTemplate, GameAction, GameManifestYaml } from '../../core/types'
import { registerGameModule } from '../../core/registry'
import { mulberry32, shuffleInPlace } from '../../core/shuffle'
import { cloneTable, createEmptyTable, moveCard, moveTop } from '../../core/table'
import type { TableState } from '../../core/types'

const DURAK_RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const

function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

function handId(i: number): string {
  return `hand:${i}`
}

function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

function rankPower(r: string | undefined): number {
  if (!r) return -1
  return DURAK_RANKS.indexOf(r as (typeof DURAK_RANKS)[number])
}

function canBeat(
  templates: Record<string, CardTemplate>,
  attackTid: string,
  defenseTid: string,
  trump: string,
): boolean {
  const a = templates[attackTid]
  const d = templates[defenseTid]
  const as = typeof a?.suit === 'string' ? a.suit : ''
  const ds = typeof d?.suit === 'string' ? d.suit : ''
  const ar = rankPower(typeof a?.rank === 'string' ? a.rank : undefined)
  const dr = rankPower(typeof d?.rank === 'string' ? d.rank : undefined)
  if (ar < 0 || dr < 0) return false
  if (as === trump && ds === trump) return dr > ar
  if (as !== trump && ds === trump) return true
  if (as === ds) return dr > ar
  return false
}

function refillHands(t: TableState, attackerFirst: number, pCount: number): void {
  const order = [attackerFirst, (attackerFirst + 1) % pCount]
  for (let round = 0; round < 6; round++) {
    for (const p of order) {
      const h = t.zones[handId(p)]!.cards
      if (h.length >= 6) continue
      if (t.zones.draw!.cards.length === 0) continue
      const c = moveTop(t, 'draw', handId(p), p === 0)
      if (c) c.faceUp = p === 0
    }
  }
}

function checkWin(t: TableState, pCount: number): number | null {
  const stock = t.zones.draw!.cards.length
  if (stock > 0) return null
  for (let p = 0; p < pCount; p++) {
    if (t.zones[handId(p)]!.cards.length === 0) return p
  }
  return null
}

export interface DurakGameState {
  phase: 'play' | 'done'
  /** Seat that must act (mirrors attacker on attack, defender on defend). */
  currentPlayer: number
  attacker: number
  defender: number
  sub: 'attack' | 'defend'
  trumpSuit: string
  message: string
  roundScores: number[] | null
}

const durakModule: GameModule<DurakGameState> = {
  moduleId: 'durak',

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

  selectAiAction(table, gs, playerIndex, rng, context: SelectAiContext) {
    void context
    if (gs.phase !== 'play' || playerIndex !== gs.currentPlayer) return null
    if (gs.sub === 'attack') {
      const hz = table.zones[handId(gs.attacker)]!.cards
      if (!hz.length) return null
      const i = Math.floor(rng() * hz.length)
      return { type: 'custom', payload: { cmd: 'dukAttack', index: i } }
    }
    const battle = table.zones.battle!.cards
    if (battle.length !== 1) return null
    const attackTid = battle[0]!.templateId
    const hz = table.zones[handId(gs.defender)]!.cards
    const beats = hz
      .map((c, i) => (canBeat(table.templates, attackTid, c.templateId, gs.trumpSuit) ? i : -1))
      .filter((i) => i >= 0)
    if (beats.length > 0) {
      const i = beats[Math.floor(rng() * beats.length)]!
      return { type: 'custom', payload: { cmd: 'dukDefend', index: i } }
    }
    return { type: 'custom', payload: { cmd: 'dukTake' } }
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

registerGameModule(durakModule)
