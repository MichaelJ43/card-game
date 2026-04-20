import type { AiDifficulty } from '../core/aiContext'
import { normalizeAiDifficulty } from '../core/aiContext'
import type { GameManifestYaml } from '../core/types'

/** Max AI opponents (player 0 is always human). Total players = 1 + this value, max 9. */
export const MAX_AI_OPPONENTS = 8

export interface CreateSessionOptions {
  /** AI opponent count; only applied for games in {@link gameSupportsConfigurableAi}. */
  aiCount?: number
  /** One per AI seat (players 1…N); locked when the deal is created. */
  aiDifficulties?: AiDifficulty[]
  /**
   * When true, no match/cumulative state (even if the manifest enables match). Unlocks AI settings
   * in the shell. Use for “end game” / practice table.
   */
  skipMatch?: boolean
  /**
   * Override match end threshold when the manifest enables match (e.g. Skyjo 100 → custom).
   * Ignored when continuing a match via `carryMatch` (existing {@link MatchState} keeps its config).
   */
  matchTargetScore?: number
  /** Skyjo: discard can only replace face-up grid cards. */
  skyjoDiscardSwapFaceUpOnly?: boolean
  /** Blackjack: dealer hits soft 17. */
  dealerHitsSoft17?: boolean
  /** War: face-down cards per player before tie-break flip (1 quick, 3 classic). */
  warTieDownCards?: 1 | 3
}

const CONFIGURABLE_AI_GAME_IDS = new Set([
  'war',
  'go-fish',
  'skyjo',
  'demo-custom',
  'crazy-eights',
  'switch',
  'poker-draw',
  'heads-up-poker',
  'uno',
  'thirty-one',
  'durak',
  'pinochle',
  'canasta',
  'sequence-race',
])

/** Games where `selectAiAction` uses {@link AiDifficulty} (per-seat). */
const AI_DIFFICULTY_GAME_IDS = new Set(['go-fish', 'skyjo'])

export function gameSupportsPerSeatAiDifficulty(gameId: string): boolean {
  return AI_DIFFICULTY_GAME_IDS.has(gameId)
}

export function gameSupportsConfigurableAi(gameId: string): boolean {
  return CONFIGURABLE_AI_GAME_IDS.has(gameId)
}

/** These games are implemented heads-up only (you + one AI). */
const HEADS_UP_GAME_IDS = new Set([
  'blackjack',
  'casino-blackjack',
  'baccarat',
  'mini-baccarat',
  'poker-draw',
  'heads-up-poker',
  'high-card-duel',
  'red-dog',
])

export function clampAiOpponentCount(gameId: string, requested: number): number {
  let n = Math.floor(Number(requested))
  if (!Number.isFinite(n)) n = 1
  const maxAi = HEADS_UP_GAME_IDS.has(gameId) ? 1 : MAX_AI_OPPONENTS
  return Math.min(maxAi, Math.max(1, n))
}

/**
 * Applies runtime AI count for supported games. Others keep the YAML manifest unchanged.
 */
export function normalizeAiDifficultiesForCount(aiCount: number, requested?: AiDifficulty[]): AiDifficulty[] {
  const out: AiDifficulty[] = []
  for (let i = 0; i < aiCount; i++) {
    out.push(normalizeAiDifficulty(requested?.[i]))
  }
  return out
}

export function manifestWithAiOpponents(
  manifest: GameManifestYaml,
  gameId: string,
  aiCount: number | undefined,
): GameManifestYaml {
  if (aiCount === undefined || !gameSupportsConfigurableAi(gameId)) {
    return manifest
  }
  const ai = clampAiOpponentCount(gameId, aiCount)
  return {
    ...manifest,
    players: {
      human: manifest.players.human,
      ai,
    },
  }
}
