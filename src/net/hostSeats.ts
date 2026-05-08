/** Pick a seat for a client peer: reuse persisted binding when that seat is free, else lowest free seat ≥ 1. */
export function pickClientSeat(params: {
  peerId: string
  seatBindings: Readonly<Record<string, number>>
  usedSeats: ReadonlySet<number>
}): number {
  const pref = params.seatBindings[params.peerId]
  if (pref != null && pref >= 1 && Number.isFinite(pref) && !params.usedSeats.has(pref)) {
    return pref
  }
  let seat = 1
  while (params.usedSeats.has(seat)) seat++
  return seat
}
