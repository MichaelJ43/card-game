import type { SelectAiContext } from '../../core/gameModule'

/** War resolves via shell “Play round”; no per-seat AI choice. */
export function warSelectAiAction(
  _table: unknown,
  _gameState: unknown,
  _playerIndex: number,
  _rng: () => number,
  _context: SelectAiContext,
): null {
  return null
}
