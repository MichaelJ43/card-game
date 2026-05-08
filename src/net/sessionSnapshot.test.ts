import { describe, expect, it } from 'vitest'
import '../games/blackjack'
import { createSession } from '../session'
import {
  parseLocalSessionSnapshot,
  parseSessionSnapshot,
  serializeSessionSnapshot,
  serializeSessionSnapshotForViewer,
} from './sessionSnapshot'

describe('serializeSessionSnapshotForViewer', () => {
  it('omits moveLedger so peers trust host table state only', () => {
    const sess = createSession('blackjack', () => 0.5)
    sess.moveLedger = [{ seq: 0, seat: 0, policy: 'human', summary: 'bj:hit' }]
    const full = serializeSessionSnapshot(sess)
    expect(full?.moveLedger).toHaveLength(1)
    const peer = serializeSessionSnapshotForViewer(sess, 0, false)
    expect(peer?.moveLedger).toBeUndefined()
  })
})

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
