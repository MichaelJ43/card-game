import { describe, it, expect } from 'vitest'
import '../../bootstrap'
import { createSession } from '../../session'
import type { CardTemplate, GameAction, TableState } from '../../core/types'
import type { SkyjoGameState } from './index'

function visibleOpeningSum(table: TableState, templates: Record<string, CardTemplate>, p: number): number {
  let s = 0
  for (const c of table.zones[`grid:${p}`]!.cards) {
    if (!c || c.templateId === '__slot__' || !c.faceUp) continue
    const v = templates[c.templateId]?.value
    if (typeof v === 'number') s += v
  }
  return s
}

function countFaceUpNonSlot(table: TableState, p: number): number {
  let n = 0
  for (const c of table.zones[`grid:${p}`]!.cards) {
    if (c && c.templateId !== '__slot__' && c.faceUp) n++
  }
  return n
}

function expectedStarter(table: TableState, templates: Record<string, CardTemplate>, pCount: number): number {
  let best = -Infinity
  let leader = 0
  for (let p = 0; p < pCount; p++) {
    const sum = visibleOpeningSum(table, templates, p)
    if (sum > best) {
      best = sum
      leader = p
    }
  }
  return leader
}

describe('Skyjo opening phase', () => {
  it('starts in opening with all grid cards face-down', () => {
    const session = createSession('skyjo', () => 0.42, undefined, { skipMatch: true, aiCount: 0 })
    const gs = session.gameState as SkyjoGameState
    expect(gs.phase).toBe('opening')
    expect(gs.currentPlayer).toBe(0)
    const g0 = session.table.zones['grid:0']!.cards
    expect(g0.length).toBe(12)
    for (const c of g0) {
      expect(c?.faceUp).toBe(false)
    }
  })

  it('rejects flipping a face-up cell', () => {
    const session = createSession('skyjo', () => 0.42, undefined, { skipMatch: true, aiCount: 0 })
    const mod = session.module
    let { table } = session
    let gameState = session.gameState as SkyjoGameState
    expect(gameState.phase).toBe('opening')

    const r1 = mod.applyAction(table, gameState, { type: 'skyjoOpeningFlip', gridIndex: 0 } as GameAction)
    expect(r1.error).toBeUndefined()
    table = r1.table
    gameState = r1.gameState as SkyjoGameState

    const rBad = mod.applyAction(table, gameState, { type: 'skyjoOpeningFlip', gridIndex: 0 } as GameAction)
    expect(rBad.error).toBeDefined()
  })

  it('after two flips for one player, advances to play with correct starter', () => {
    const session = createSession('skyjo', () => 0.42, undefined, { skipMatch: true, aiCount: 0 })
    const mod = session.module
    let { table } = session
    let gameState = session.gameState as SkyjoGameState
    const templates = table.templates

    const r1 = mod.applyAction(table, gameState, { type: 'skyjoOpeningFlip', gridIndex: 2 } as GameAction)
    expect(r1.error).toBeUndefined()
    table = r1.table
    gameState = r1.gameState as SkyjoGameState
    expect(gameState.phase).toBe('opening')

    const r2 = mod.applyAction(table, gameState, { type: 'skyjoOpeningFlip', gridIndex: 5 } as GameAction)
    expect(r2.error).toBeUndefined()
    table = r2.table
    gameState = r2.gameState as SkyjoGameState

    expect(gameState.phase).toBe('play')
    expect(gameState.currentPlayer).toBe(expectedStarter(table, templates, 1))
  })

  it('two-player opening completes and starter has max visible sum', () => {
    const session = createSession('skyjo', () => 0.77, undefined, { skipMatch: true, aiCount: 1 })
    const mod = session.module
    let { table } = session
    let gameState = session.gameState as SkyjoGameState
    const templates = table.templates
    const pCount = gameState.playerCount
    expect(pCount).toBe(2)

    while (gameState.phase === 'opening') {
      const legals = mod.getLegalActions(table, gameState)
      const flips = legals.filter((a): a is Extract<GameAction, { type: 'skyjoOpeningFlip' }> => a.type === 'skyjoOpeningFlip')
      expect(flips.length).toBeGreaterThan(0)
      const pick = flips[0]!
      const r = mod.applyAction(table, gameState, pick)
      expect(r.error).toBeUndefined()
      table = r.table
      gameState = r.gameState as SkyjoGameState
    }

    const final = gameState
    expect(final.phase).toBe('play')
    expect(countFaceUpNonSlot(table, 0)).toBe(2)
    expect(countFaceUpNonSlot(table, 1)).toBe(2)
    expect(final.currentPlayer).toBe(expectedStarter(table, templates, pCount))
  })
})
