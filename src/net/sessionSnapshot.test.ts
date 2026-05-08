import { describe, expect, it } from 'vitest'
import '../games/blackjack'
import { createSession } from '../session'
import { parseLocalSessionSnapshot, parseSessionSnapshot, serializeSessionSnapshot } from './sessionSnapshot'

describe('parseLocalSessionSnapshot', () => {
  it('restores session without net metadata', () => {
    const sess = createSession('blackjack', () => 0.5)
    const wire = serializeSessionSnapshot(sess)
    expect(wire).not.toBeNull()
    const local = parseLocalSessionSnapshot(wire)
    expect(local).not.toBeNull()
    expect(local?.net).toBeUndefined()
    const remote = parseSessionSnapshot({ ...wire!, viewerSeat: 1, spectator: false }, 1)
    expect(remote?.net).toEqual({ seat: 1, spectator: false })
  })
})
