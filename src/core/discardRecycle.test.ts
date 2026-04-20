import { describe, it, expect } from 'vitest'
import { mulberry32 } from './shuffle'
import type { CardInstance, TableState } from './types'
import {
  recycleDiscardIntoDrawWhenEmpty,
  isDeckDrawAvailableAfterOptionalRecycle,
} from './discardRecycle'

function mkCards(n: number, prefix = 'c'): CardInstance[] {
  return Array.from({ length: n }, (_, i) => ({
    instanceId: `${prefix}-${i}`,
    templateId: 't',
    faceUp: false,
  }))
}

function mkTable(drawCount: number, discardCount: number): TableState {
  return {
    templates: {},
    zoneOrder: ['draw', 'discard'],
    zones: {
      draw: { id: 'draw', kind: 'stack', defaultFaceUp: false, cards: mkCards(drawCount, 'draw') },
      discard: {
        id: 'discard',
        kind: 'stack',
        defaultFaceUp: true,
        cards: mkCards(discardCount, 'disc'),
      },
    },
  }
}

describe('recycleDiscardIntoDrawWhenEmpty', () => {
  it('returns false when disabled', () => {
    const table = mkTable(0, 5)
    const changed = recycleDiscardIntoDrawWhenEmpty(table, mulberry32(1), {
      enabled: false,
      preserveTopDiscard: true,
    })
    expect(changed).toBe(false)
    expect(table.zones.discard!.cards).toHaveLength(5)
    expect(table.zones.draw!.cards).toHaveLength(0)
  })

  it('returns false when draw is not empty', () => {
    const table = mkTable(3, 5)
    const changed = recycleDiscardIntoDrawWhenEmpty(table, mulberry32(1), {
      enabled: true,
      preserveTopDiscard: true,
    })
    expect(changed).toBe(false)
  })

  it('preserves top discard and moves rest to draw', () => {
    const table = mkTable(0, 4)
    const topId = table.zones.discard!.cards[table.zones.discard!.cards.length - 1]!.instanceId
    const changed = recycleDiscardIntoDrawWhenEmpty(table, mulberry32(42), {
      enabled: true,
      preserveTopDiscard: true,
    })
    expect(changed).toBe(true)
    expect(table.zones.discard!.cards).toHaveLength(1)
    expect(table.zones.discard!.cards[0]!.instanceId).toBe(topId)
    expect(table.zones.draw!.cards).toHaveLength(3)
  })

  it('moves all discard into draw when not preserving top', () => {
    const table = mkTable(0, 4)
    const changed = recycleDiscardIntoDrawWhenEmpty(table, mulberry32(7), {
      enabled: true,
      preserveTopDiscard: false,
    })
    expect(changed).toBe(true)
    expect(table.zones.discard!.cards).toHaveLength(0)
    expect(table.zones.draw!.cards).toHaveLength(4)
  })

  it('no-ops when preserveTopDiscard and only 1 card on discard', () => {
    const table = mkTable(0, 1)
    const changed = recycleDiscardIntoDrawWhenEmpty(table, mulberry32(1), {
      enabled: true,
      preserveTopDiscard: true,
    })
    expect(changed).toBe(false)
    expect(table.zones.discard!.cards).toHaveLength(1)
    expect(table.zones.draw!.cards).toHaveLength(0)
  })
})

describe('isDeckDrawAvailableAfterOptionalRecycle', () => {
  it('true when draw has cards', () => {
    const table = mkTable(2, 0)
    expect(isDeckDrawAvailableAfterOptionalRecycle(table, false, true)).toBe(true)
  })

  it('false when draw empty and recycle disabled', () => {
    const table = mkTable(0, 5)
    expect(isDeckDrawAvailableAfterOptionalRecycle(table, false, true)).toBe(false)
  })

  it('true when draw empty, recycle enabled, discard has >1 with preserveTop', () => {
    const table = mkTable(0, 3)
    expect(isDeckDrawAvailableAfterOptionalRecycle(table, true, true)).toBe(true)
  })

  it('false when draw empty, recycle enabled, discard has only 1 with preserveTop', () => {
    const table = mkTable(0, 1)
    expect(isDeckDrawAvailableAfterOptionalRecycle(table, true, true)).toBe(false)
  })

  it('true when draw empty, recycle enabled, discard any with not preserveTop', () => {
    const table = mkTable(0, 1)
    expect(isDeckDrawAvailableAfterOptionalRecycle(table, true, false)).toBe(true)
  })
})
