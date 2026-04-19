import type { SelectAiContext } from './aiContext'
import type { CardInstance, CardTemplate, GameAction, GameManifestYaml, TableState } from './types'

export type { AiDifficulty, SelectAiContext } from './aiContext'

export interface GameModuleContext {
  manifest: GameManifestYaml
  templates: Record<string, CardTemplate>
  rng: () => number
  /** Present when session continues a match; use for chip stacks / cumulative state at deal time. */
  matchCumulativeScores?: number[]
}

export interface ApplyResult<TGame> {
  table: TableState
  gameState: TGame
  error?: string
}

export interface GameModule<TGame = unknown> {
  readonly moduleId: string
  setup(ctx: GameModuleContext, instances: CardInstance[]): {
    table: TableState
    gameState: TGame
  }
  getLegalActions(table: TableState, gameState: TGame): GameAction[]
  applyAction(
    table: TableState,
    gameState: TGame,
    action: GameAction,
  ): ApplyResult<TGame>
  /**
   * AI policy; return null if this game advances without per-player AI choice.
   * `context.difficulty` is chosen per AI seat for this deal (see session `aiPlayerConfig`).
   */
  selectAiAction(
    table: TableState,
    gameState: TGame,
    playerIndex: number,
    rng: () => number,
    context: SelectAiContext,
  ): GameAction | null
  statusText(table: TableState, gameState: TGame): string
  /**
   * Multi-round match support: when the round is finished (deal scored), return each player’s
   * points for that round. Return null if not in a finished-round state.
   */
  extractMatchRoundScores?(gameState: TGame): number[] | null
  /** True when this game state represents a completed round ready to merge into cumulative scores. */
  isMatchRoundFinished?(gameState: TGame): boolean
}
