/**
 * 1-based seating labels: index 0 is "You" (Player 1); others are Player 2, 3, …
 */
export function playerSeatLabel(playerIndex: number, humanIndex = 0): string {
  if (humanIndex >= 0 && playerIndex === humanIndex) return 'You'
  return `Player ${playerIndex + 1}`
}

/** Ordinal among AI seats only (first AI seat in table order → 1). */
export function aiPlayerMenuLabel(aiOrdinal: number): string {
  return `AI Player ${aiOrdinal + 1}`
}
