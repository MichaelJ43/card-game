import type { SelectAiContext } from '../../core/gameModule'

/** Demo deck reveal step — driven only by the human/UI button. */
export function demoCustomSelectAiAction(
  _table: unknown,
  _gameState: unknown,
  _playerIndex: number,
  _rng: () => number,
  _context: SelectAiContext,
): null {
  return null
}
