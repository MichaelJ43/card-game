import type { ApplyResult, GameModule, SelectAiContext } from '../../core/gameModule'
import type { CardInstance, CardTemplate, GameAction, GameManifestYaml } from '../../core/types'
import { registerGameModule } from '../../core/registry'
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

function tpl(templates: Record<string, CardTemplate>, id: string): CardTemplate | undefined {
  return templates[id]
}

function uc(t: CardTemplate | undefined): string {
  return typeof t?.uc === 'string' ? t.uc : ''
}

function uface(t: CardTemplate | undefined): string {
  return typeof t?.uf === 'string' ? t.uf : ''
}

type UnoColor = 'r' | 'y' | 'g' | 'b'

const UNO_COLORS: UnoColor[] = ['r', 'y', 'g', 'b']

function topDiscard(table: TableState): CardInstance | null {
  const d = table.zones.discard?.cards
  if (!d?.length) return null
  return d[d.length - 1]!
}

function canPlay(playTpl: CardTemplate, topTpl: CardTemplate, currentColor: UnoColor): boolean {
  const p = uc(playTpl)
  if (p === 'w') return true
  const tc = uc(topTpl)
  if (tc === 'w') {
    return p === currentColor || p === 'w'
  }
  if (p === currentColor) return true
  if (uface(playTpl) === uface(topTpl)) return true
  return false
}

function isNumberFace(f: string): boolean {
  return f.length === 1 && f >= '0' && f <= '9'
}

function starterOk(t: CardTemplate | undefined): boolean {
  if (!t) return false
  return isNumberFace(uface(t))
}

function step(cur: number, direction: number, n: number): number {
  return (cur + direction + n * 100) % n
}

function reshuffleDrawFromDiscard(table: TableState, rng: () => number): void {
  const draw = table.zones.draw!
  const disc = table.zones.discard!
  if (draw.cards.length > 0 || disc.cards.length <= 1) return
  const top = disc.cards.pop()!
  const rest = [...disc.cards]
  disc.cards.length = 0
  disc.cards.push(top)
  shuffleInPlace(rest, rng)
  for (const c of rest) {
    draw.cards.push(c)
  }
}

function ensureDraw(table: TableState, rng: () => number): void {
  reshuffleDrawFromDiscard(table, rng)
}

function handValue(templates: Record<string, CardTemplate>, cards: CardInstance[]): number {
  let s = 0
  for (const c of cards) {
    const t = tpl(templates, c.templateId)
    if (!t) continue
    if (uc(t) === 'w') {
      s += 50
    } else {
      const f = uface(t)
      if (f === 'sk' || f === 'rev' || f === 'd2') s += 20
      else if (isNumberFace(f)) s += Number(f)
    }
  }
  return s
}

export interface UnoGameState {
  phase: 'play' | 'roundOver'
  currentPlayer: number
  direction: 1 | -1
  currentColor: UnoColor
  drewThisTurn: boolean
  drawSlot: number | null
  message: string
  roundScores: number[] | null
}

function roundOverScores(
  templates: Record<string, CardTemplate>,
  table: TableState,
  pCount: number,
  winner: number,
): number[] {
  const scores = Array.from({ length: pCount }, () => 0)
  let total = 0
  for (let p = 0; p < pCount; p++) {
    if (p === winner) continue
    total += handValue(templates, table.zones[handId(p)]!.cards)
  }
  scores[winner] = total
  return scores
}

function computeLegalActions(
  table: TableState,
  gs: UnoGameState,
  playerIndex: number,
  rng: () => number,
): GameAction[] {
  if (gs.phase !== 'play' || gs.currentPlayer !== playerIndex) return []
  ensureDraw(table, rng)
  const top = topDiscard(table)
  if (!top) return []
  const templates = table.templates
  const topTpl = templates[top.templateId]!
  const hz = table.zones[handId(playerIndex)]!.cards
  const out: GameAction[] = []

  if (gs.drewThisTurn && gs.drawSlot !== null) {
    const idx = gs.drawSlot
    const card = hz[idx]
    if (!card) {
      out.push({ type: 'custom', payload: { cmd: 'unoPassAfterDraw' } })
      return out
    }
    const ct = templates[card.templateId]!
    if (canPlay(ct, topTpl, gs.currentColor)) {
      if (uc(ct) === 'w') {
        for (const col of UNO_COLORS) {
          out.push({ type: 'custom', payload: { cmd: 'unoPlay', index: idx, color: col } })
        }
      } else {
        out.push({ type: 'custom', payload: { cmd: 'unoPlay', index: idx } })
      }
    }
    out.push({ type: 'custom', payload: { cmd: 'unoPassAfterDraw' } })
    return out
  }

  const plays: GameAction[] = []
  hz.forEach((c, i) => {
    const ct = templates[c.templateId]!
    if (canPlay(ct, topTpl, gs.currentColor)) {
      if (uc(ct) === 'w') {
        for (const col of UNO_COLORS) {
          plays.push({ type: 'custom', payload: { cmd: 'unoPlay', index: i, color: col } })
        }
      } else {
        plays.push({ type: 'custom', payload: { cmd: 'unoPlay', index: i } })
      }
    }
  })

  if (plays.length > 0) return plays
  if (table.zones.draw!.cards.length > 0) {
    return [{ type: 'custom', payload: { cmd: 'unoDraw' } }]
  }
  return [{ type: 'custom', payload: { cmd: 'unoPass' } }]
}

const unoModule: GameModule<UnoGameState> = {
  moduleId: 'uno',

  setup(ctx, instances) {
    const pCount = totalPlayers(ctx.manifest)
    if (pCount < 2 || pCount > 4) throw new Error('Uno needs 2–4 players.')
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
    const HAND = 7
    for (let r = 0; r < HAND; r++) {
      for (let p = 0; p < pCount; p++) {
        const c = moveTop(table, 'draw', handId(p), p === 0)
        if (c) c.faceUp = p === 0
      }
    }
    let guard = 0
    let starter: CardInstance | null = null
    while (guard++ < 200) {
      const moved = moveTop(table, 'draw', 'discard', true)
      if (!moved) throw new Error('Deck error.')
      starter = moved
      const tt = ctx.templates[moved.templateId]
      if (starterOk(tt)) break
      table.zones.discard!.cards.pop()
      table.zones.draw!.cards.unshift(moved)
    }
    if (!starter || !starterOk(ctx.templates[starter.templateId])) {
      throw new Error('Could not find a valid starter.')
    }
    const topT = ctx.templates[starter.templateId]!
    const startColor = uc(topT) as UnoColor

    return {
      table,
      gameState: {
        phase: 'play',
        currentPlayer: 0,
        direction: 1,
        currentColor: startColor,
        drewThisTurn: false,
        drawSlot: null,
        message: 'Match color or number — Wilds are always playable.',
        roundScores: null,
      },
    }
  },

  getLegalActions(table, gs) {
    return computeLegalActions(table, gs, 0, Math.random)
  },

  applyAction(table, gs, action): ApplyResult<UnoGameState> {
    const t = cloneTable(table)
    const templates = t.templates
    if (action.type !== 'custom') return { table: t, gameState: gs, error: 'Unsupported.' }
    const c = cmd(action.payload)
    const cp = gs.currentPlayer
    const pCount = Object.keys(t.zones).filter((k) => k.startsWith('hand:')).length
    const hid = handId(cp)
    const hz = t.zones[hid]!.cards
    const rng = () => Math.random()

    if (gs.phase !== 'play') return { table: t, gameState: gs, error: 'Round over.' }

    if (c === 'unoPassAfterDraw') {
      if (!gs.drewThisTurn) return { table: t, gameState: gs, error: 'Pass only after drawing.' }
      const next = step(cp, gs.direction, pCount)
      return {
        table: t,
        gameState: {
          ...gs,
          currentPlayer: next,
          drewThisTurn: false,
          drawSlot: null,
          message: next === 0 ? 'Your turn.' : `Player ${next}'s turn.`,
        },
      }
    }

    if (c === 'unoPass') {
      if (gs.drewThisTurn) return { table: t, gameState: gs, error: 'Finish draw step.' }
      ensureDraw(t, rng)
      if (t.zones.draw!.cards.length > 0) return { table: t, gameState: gs, error: 'Must draw.' }
      const next = step(cp, gs.direction, pCount)
      return {
        table: t,
        gameState: {
          ...gs,
          currentPlayer: next,
          message: next === 0 ? 'Your turn.' : `Player ${next}'s turn.`,
        },
      }
    }

    if (c === 'unoDraw') {
      if (gs.drewThisTurn) return { table: t, gameState: gs, error: 'Already drew.' }
      const top = topDiscard(t)
      if (!top) return { table: t, gameState: gs, error: 'No discard.' }
      const topTpl = templates[top.templateId]!
      const hasPlay = hz.some((card) => canPlay(templates[card.templateId]!, topTpl, gs.currentColor))
      if (hasPlay) return { table: t, gameState: gs, error: 'You have a playable card.' }
      ensureDraw(t, rng)
      if (t.zones.draw!.cards.length === 0) return { table: t, gameState: gs, error: 'Cannot draw.' }
      moveTop(t, 'draw', hid, cp === 0)
      const newSlot = hz.length - 1
      return {
        table: t,
        gameState: {
          ...gs,
          drewThisTurn: true,
          drawSlot: newSlot,
          message: 'Play the drawn card or end turn.',
        },
      }
    }

    if (c !== 'unoPlay') return { table: t, gameState: gs, error: 'Unknown action.' }

    const idx = Number((action.payload as { index?: number }).index)
    if (!Number.isFinite(idx) || idx < 0 || idx >= hz.length) {
      return { table: t, gameState: gs, error: 'Bad card.' }
    }
    const topC = topDiscard(t)
    if (!topC) return { table: t, gameState: gs, error: 'No discard.' }
    const topTpl = templates[topC.templateId]!
    const card = hz[idx]!
    const playTpl = templates[card.templateId]!
    if (!canPlay(playTpl, topTpl, gs.currentColor)) {
      return { table: t, gameState: gs, error: 'Illegal play.' }
    }
    if (gs.drewThisTurn && gs.drawSlot !== idx) {
      return { table: t, gameState: gs, error: 'Play the drawn card or pass.' }
    }
    const colorPick = (action.payload as { color?: string }).color
    if (uc(playTpl) === 'w') {
      if (typeof colorPick !== 'string' || !UNO_COLORS.includes(colorPick as UnoColor)) {
        return { table: t, gameState: gs, error: 'Pick a color for Wild.' }
      }
    }

    hz.splice(idx, 1)
    card.faceUp = true
    t.zones.discard!.cards.push(card)

    let newColor: UnoColor = gs.currentColor
    if (uc(playTpl) === 'w') {
      newColor = colorPick as UnoColor
    } else {
      newColor = uc(playTpl) as UnoColor
    }

    if (hz.length === 0) {
      const scores = roundOverScores(templates, t, pCount, cp)
      return {
        table: t,
        gameState: {
          phase: 'roundOver',
          currentPlayer: cp,
          direction: gs.direction,
          currentColor: newColor,
          drewThisTurn: false,
          drawSlot: null,
          message: `Player ${cp} went out!`,
          roundScores: scores,
        },
      }
    }

    let dir: 1 | -1 = gs.direction
    let next = cp
    const uf = uface(playTpl)

    const victimDraw = (victim: number, count: number) => {
      for (let i = 0; i < count; i++) {
        ensureDraw(t, rng)
        if (t.zones.draw!.cards.length === 0) break
        moveTop(t, 'draw', handId(victim), victim === 0)
      }
    }

    if (uf === 'w4') {
      const v = step(cp, dir, pCount)
      victimDraw(v, 4)
      next = step(v, dir, pCount)
    } else if (uf === 'd2') {
      const v = step(cp, dir, pCount)
      victimDraw(v, 2)
      next = step(v, dir, pCount)
    } else if (uf === 'sk') {
      next = pCount === 2 ? cp : step(step(cp, dir, pCount), dir, pCount)
    } else if (uf === 'rev') {
      if (pCount === 2) {
        next = cp
      } else {
        dir = (dir * -1) as 1 | -1
        next = step(cp, dir, pCount)
      }
    } else {
      next = step(cp, dir, pCount)
    }

    return {
      table: t,
      gameState: {
        ...gs,
        currentPlayer: next,
        direction: dir,
        currentColor: newColor,
        drewThisTurn: false,
        drawSlot: null,
        message: next === 0 ? 'Your turn.' : `Player ${next}'s turn.`,
      },
    }
  },

  selectAiAction(table, gs, playerIndex, rng, _ctx: SelectAiContext): GameAction | null {
    type CustomAction = Extract<GameAction, { type: 'custom' }>
    const legals = computeLegalActions(table, gs, playerIndex, rng) as CustomAction[]
    if (legals.length === 0) return null

    const byCmd = (s: string) => legals.filter((a) => cmd(a.payload) === s)

    const passAfter = byCmd('unoPassAfterDraw')
    const playActs = byCmd('unoPlay')
    if (passAfter.length && playActs.length > 0) {
      return rng() < 0.72 ? playActs[Math.floor(rng() * playActs.length)]! : passAfter[0]!
    }
    if (passAfter.length === legals.length) return passAfter[0]!

    const draws = byCmd('unoDraw')
    if (draws.length === 1 && legals.length === 1) return draws[0]!

    const plays = legals.filter((a: CustomAction) => cmd(a.payload) === 'unoPlay')
    if (plays.length === 0) {
      return draws[0] ?? byCmd('unoPass')[0] ?? null
    }

    const nonWild = plays.filter((a) => {
      const ix = Number((a.payload as { index?: number }).index)
      const h = table.zones[handId(playerIndex)]!.cards[ix]
      return h && uc(tpl(table.templates, h.templateId)) !== 'w'
    })
    const pool = nonWild.length > 0 ? nonWild : plays
    return pool[Math.floor(rng() * pool.length)]!
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

registerGameModule(unoModule)
