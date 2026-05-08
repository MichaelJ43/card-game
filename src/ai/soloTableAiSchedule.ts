import type { GameSession } from '../session'

/** Games where the shell runs table AI on non-human turns (`selectAiAction`). */
export const TABLE_AI_MEDIUM_MODULES = new Set([
  'thirty-one',
  'euchre',
  'durak',
  'pinochle',
  'canasta',
  'sequence-race',
])

export interface SoloAiTick {
  delayMs: number
  playerIndex: number
  /** Compared after the delay to detect turn changes. */
  staleKey: string
}

function firstAi(session: GameSession | null): number {
  if (!session) return 1
  return session.manifest.players.human
}

/**
 * When non-null, the shell should schedule an AI move after `delayMs` for `playerIndex`
 * (solo / non-network sessions only).
 */
export function computeSoloAiTick(session: GameSession | null): SoloAiTick | null {
  if (!session || session.net) return null
  const ai0 = firstAi(session)

  if (session.manifest.module === 'go-fish') {
    const gs = session.gameState as { phase?: string; currentPlayer?: number }
    if (gs.phase !== 'playing' || typeof gs.currentPlayer !== 'number' || gs.currentPlayer < ai0) return null
    return {
      delayMs: 550,
      playerIndex: gs.currentPlayer,
      staleKey: `go-fish:${gs.phase}:${gs.currentPlayer}`,
    }
  }

  if (session.manifest.module === 'skyjo') {
    const gs = session.gameState as { phase?: string; currentPlayer?: number }
    if (gs.phase === 'roundOver' || typeof gs.currentPlayer !== 'number' || gs.currentPlayer < ai0) return null
    return {
      delayMs: 650,
      playerIndex: gs.currentPlayer,
      staleKey: `skyjo:${String(gs.phase)}:${gs.currentPlayer}`,
    }
  }

  if (session.manifest.module === 'crazy-eights' || session.manifest.module === 'uno') {
    const gs = session.gameState as { phase?: string; currentPlayer?: number }
    if (gs.phase !== 'play' || typeof gs.currentPlayer !== 'number' || gs.currentPlayer < ai0) return null
    return {
      delayMs: 500,
      playerIndex: gs.currentPlayer,
      staleKey: `${session.manifest.module}:${gs.currentPlayer}`,
    }
  }

  if (TABLE_AI_MEDIUM_MODULES.has(session.manifest.module)) {
    const gs = session.gameState as { phase?: string; currentPlayer?: number }
    if (gs.phase !== 'play' || typeof gs.currentPlayer !== 'number' || gs.currentPlayer < ai0) return null
    return {
      delayMs: 500,
      playerIndex: gs.currentPlayer,
      staleKey: `${session.manifest.module}:${gs.currentPlayer}`,
    }
  }

  return null
}
