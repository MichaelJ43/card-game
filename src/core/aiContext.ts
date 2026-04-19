/** Per-AI policy; locked for the current deal (see session `aiPlayerConfig`). */
export type AiDifficulty = 'easy' | 'medium' | 'hard'

export const AI_DIFFICULTY_OPTIONS: readonly AiDifficulty[] = ['easy', 'medium', 'hard']

/** Passed to {@link import('./gameModule').GameModule.selectAiAction} for the current AI seat. */
export interface SelectAiContext {
  difficulty: AiDifficulty
  /** Cumulative match totals before this round (same length as seats). Used by Skyjo for finisher double penalty. */
  matchCumulativeScores?: readonly number[]
  /** Match end threshold (e.g. 100). */
  matchTargetScore?: number
}

export function normalizeAiDifficulty(v: unknown): AiDifficulty {
  return v === 'easy' || v === 'hard' || v === 'medium' ? v : 'medium'
}
