import { describe, it, expect } from 'vitest'
import { generateRoomCode, isRoomCode } from './roomCode'

describe('lambda room codes', () => {
  it('generates valid codes', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateRoomCode()
      expect(isRoomCode(c)).toBe(true)
    }
  })

  it('rejects bad inputs', () => {
    expect(isRoomCode('short')).toBe(false)
    expect(isRoomCode('abc123')).toBe(false)
    expect(isRoomCode('ABCDE1')).toBe(false)
  })
})
