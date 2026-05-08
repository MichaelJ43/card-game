import { describe, expect, it } from 'vitest'
import { pickClientSeat } from './hostSeats'

describe('pickClientSeat', () => {
  it('reuses bound seat when free', () => {
    expect(
      pickClientSeat({
        peerId: 'c-1',
        seatBindings: { 'c-1': 2 },
        usedSeats: new Set([0]),
      }),
    ).toBe(2)
  })

  it('skips taken preferred seat and picks next free', () => {
    expect(
      pickClientSeat({
        peerId: 'c-1',
        seatBindings: { 'c-1': 2 },
        usedSeats: new Set([0, 2]),
      }),
    ).toBe(1)
  })

  it('assigns lowest free when no binding', () => {
    expect(
      pickClientSeat({
        peerId: 'c-new',
        seatBindings: {},
        usedSeats: new Set([0, 1]),
      }),
    ).toBe(2)
  })
})
