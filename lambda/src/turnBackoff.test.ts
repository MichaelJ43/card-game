import { describe, expect, it } from 'vitest'
import { backoffDelayMs } from './turnBackoff'

describe('backoffDelayMs', () => {
  it('doubles with stage and caps at 24h', () => {
    expect(backoffDelayMs(0)).toBe(15 * 60 * 1000)
    expect(backoffDelayMs(1)).toBe(30 * 60 * 1000)
    expect(backoffDelayMs(10)).toBe(24 * 60 * 60 * 1000)
  })
})
