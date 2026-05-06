import { describe, expect, it } from 'vitest'
import { estimateUsdFromUsage } from './geminiCost'
import { parseChoiceIndexFromModelText } from './parseChoice'

describe('parseChoiceIndexFromModelText', () => {
  it('parses bare json', () => {
    expect(parseChoiceIndexFromModelText('{"choiceIndex":2}', 5)).toBe(2)
  })

  it('parses fenced json', () => {
    expect(parseChoiceIndexFromModelText('```json\n{"choiceIndex":0}\n```', 3)).toBe(0)
  })

  it('rejects out of range', () => {
    expect(parseChoiceIndexFromModelText('{"choiceIndex":3}', 3)).toBeNull()
  })
})

describe('gemini cost estimate', () => {
  it('scales linearly', () => {
    const a = estimateUsdFromUsage(1_000_000, 0)
    const b = estimateUsdFromUsage(0, 1_000_000)
    expect(a).toBeCloseTo(0.1, 6)
    expect(b).toBeCloseTo(0.4, 6)
  })
})
