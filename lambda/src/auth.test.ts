import { describe, it, expect } from 'vitest'
import { signRoomToken, verifyRoomToken } from './auth'

describe('signRoomToken / verifyRoomToken', () => {
  const secret = 'test-secret'

  it('round-trips claims', () => {
    const t = signRoomToken({ roomCode: 'ABCDEF', peerId: 'h-1', role: 'host' }, secret, 60)
    const claims = verifyRoomToken(t, secret)
    expect(claims.roomCode).toBe('ABCDEF')
    expect(claims.peerId).toBe('h-1')
    expect(claims.role).toBe('host')
  })

  it('rejects wrong secret', () => {
    const t = signRoomToken({ roomCode: 'ABCDEF', peerId: 'c-1', role: 'client' }, secret, 60)
    expect(() => verifyRoomToken(t, 'other')).toThrow()
  })
})
