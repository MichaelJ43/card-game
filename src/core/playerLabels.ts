/**
 * 1-based seating labels: index 0 is "You" (Player 1); others are Player 2, 3, …
 */
export function playerSeatLabel(playerIndex: number, humanIndex = 0): string {
  if (playerIndex === humanIndex) return 'You'
  return `Player ${playerIndex + 1}`
}
