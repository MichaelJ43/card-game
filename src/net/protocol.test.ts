import { describe, it, expect } from 'vitest'
import {
  ROOM_CODE_LENGTH,
  ROOM_CODE_ALPHABET,
  generateRoomCode,
  isRoomCode,
  isSignalingMessage,
  isPeerMessage,
} from './protocol'
import { mulberry32 } from '../core/shuffle'

describe('room codes', () => {
  it('generateRoomCode returns expected length from allowed alphabet', () => {
    const rng = mulberry32(123)
    const code = generateRoomCode(rng)
    expect(code).toHaveLength(ROOM_CODE_LENGTH)
    for (const ch of code) {
      expect(ROOM_CODE_ALPHABET).toContain(ch)
    }
  })

  it('isRoomCode accepts generated codes and rejects others', () => {
    expect(isRoomCode(generateRoomCode(mulberry32(7)))).toBe(true)
    expect(isRoomCode('')).toBe(false)
    expect(isRoomCode('short')).toBe(false)
    expect(isRoomCode('too-long-code')).toBe(false)
    expect(isRoomCode('ABCDE1')).toBe(false)
    expect(isRoomCode('abcdef')).toBe(false)
    expect(isRoomCode(123 as unknown)).toBe(false)
  })
})

describe('message type guards', () => {
  it('isSignalingMessage', () => {
    expect(isSignalingMessage({ type: 'hello' })).toBe(true)
    expect(isSignalingMessage({ type: 'relay' })).toBe(true)
    expect(isSignalingMessage({ type: 'nope' })).toBe(false)
    expect(isSignalingMessage(null)).toBe(false)
  })

  it('isPeerMessage', () => {
    expect(isPeerMessage({ type: 'snapshot' })).toBe(true)
    expect(isPeerMessage({ type: 'intent' })).toBe(true)
    expect(isPeerMessage({ type: 'nope' })).toBe(false)
  })
})
