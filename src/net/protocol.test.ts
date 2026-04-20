import { describe, it, expect } from 'vitest'
import {
  ROOM_CODE_LENGTH,
  ROOM_CODE_ALPHABET,
  generateRoomCode,
  isRoomCode,
  isSignalingMessage,
  isPeerMessage,
  sanitizeChatText,
  sanitizeDisplayName,
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

describe('sanitizeChatText', () => {
  it('trims, strips controls, caps at 140', () => {
    expect(sanitizeChatText('  hi  ')).toBe('hi')
    expect(sanitizeChatText('a'.repeat(200))!.length).toBe(140)
    expect(sanitizeChatText('\x01visible')).toBe('visible')
  })

  it('rejects empty', () => {
    expect(sanitizeChatText('')).toBeNull()
    expect(sanitizeChatText('   ')).toBeNull()
    expect(sanitizeChatText(1 as unknown)).toBeNull()
  })
})

describe('sanitizeDisplayName', () => {
  it('trims and caps length', () => {
    expect(sanitizeDisplayName('  River  ')).toBe('River')
    expect(sanitizeDisplayName('x'.repeat(50))!.length).toBe(40)
  })

  it('rejects empty', () => {
    expect(sanitizeDisplayName('')).toBeNull()
    expect(sanitizeDisplayName('   ')).toBeNull()
    expect(sanitizeDisplayName(1 as unknown)).toBeNull()
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
    expect(isPeerMessage({ type: 'setDisplayName' })).toBe(true)
    expect(isPeerMessage({ type: 'chatSend' })).toBe(true)
    expect(isPeerMessage({ type: 'chatLine' })).toBe(true)
    expect(isPeerMessage({ type: 'nope' })).toBe(false)
  })
})
