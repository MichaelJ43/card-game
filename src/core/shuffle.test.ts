import { describe, it, expect } from 'vitest'
import { mulberry32, shuffleInPlace, shuffleCards } from './shuffle'
import type { CardInstance } from './types'

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('differs across seeds', () => {
    const a = Array.from({ length: 10 }, ((r) => () => r())(mulberry32(1)))
    const b = Array.from({ length: 10 }, ((r) => () => r())(mulberry32(2)))
    expect(a).not.toEqual(b)
  })
})

describe('shuffleInPlace / shuffleCards', () => {
  it('shuffleInPlace preserves length and set membership', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const copy = [...arr]
    shuffleInPlace(copy, mulberry32(42))
    expect(copy).toHaveLength(arr.length)
    expect([...copy].sort((x, y) => x - y)).toEqual(arr)
  })

  it('shuffleCards returns a new array and does not mutate input', () => {
    const cards: CardInstance[] = Array.from({ length: 5 }, (_, i) => ({
      instanceId: `c${i}`,
      templateId: 't',
      faceUp: false,
    }))
    const original = [...cards]
    const out = shuffleCards(cards, { seed: 1 })
    expect(out).not.toBe(cards)
    expect(cards).toEqual(original)
    expect([...out].map((c) => c.instanceId).sort()).toEqual(
      original.map((c) => c.instanceId).sort(),
    )
  })
})
