import type { GameSession } from '../session'

/** Stable value when the “whose turn” seat changes; null if the game has no numeric currentPlayer. */
export function turnSignalFromSession(session: GameSession | null): string | null {
  if (!session) return null
  const gs = session.gameState as { currentPlayer?: number; phase?: string }
  if (typeof gs.currentPlayer !== 'number') return null
  return `${session.manifest.id}:${String(gs.phase ?? '')}:${gs.currentPlayer}`
}
