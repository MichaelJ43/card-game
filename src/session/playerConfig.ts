import type { AiDifficulty } from '../core/aiContext'
import { normalizeAiDifficulty } from '../core/aiContext'
import type { GameManifestYaml } from '../core/types'

/** Max AI opponents when the table is not heads-up-only. Total seats = `human + ai` (see manifest). */
export const MAX_AI_OPPONENTS = 8

export interface CreateSessionOptions {
  /** AI opponent count; only applied for games in {@link gameSupportsConfigurableAi}. Use **0** for human-only on supported titles; heads-up-only games still require **1**. */
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
  /**
   * Override “shuffle discard into draw when draw is empty” for games that support it (see house rules).
   */
  reshuffleDiscardWhenDrawEmpty?: boolean
  /**
   * Remote human opponents (networked peers). Applied only for games in {@link gameSupportsOnlineMultiplayer}.
   * Player 0 is always the local human; remote humans occupy 1..N before any AI seats.
   */
  remoteHumanCount?: number
}

/** Max remote human opponents per table (excludes the host / player 0). */
export const MAX_REMOTE_HUMANS = 7

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
  const headsUp = HEADS_UP_GAME_IDS.has(gameId)
  const minAi = headsUp ? 1 : 0
  const maxAi = headsUp ? 1 : MAX_AI_OPPONENTS
  return Math.min(maxAi, Math.max(minAi, n))
}

/** Min/max for the shell AI-opponent control when {@link gameSupportsConfigurableAi} is true. */
export function configurableAiOpponentLimits(gameId: string): { min: number; max: number } {
  const headsUp = HEADS_UP_GAME_IDS.has(gameId)
  return { min: headsUp ? 1 : 0, max: headsUp ? 1 : MAX_AI_OPPONENTS }
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

/**
 * Games where remote humans can join in addition to the local host.
 * Defaults to the same set as configurable AI (seat slots work the same way),
 * minus titles whose UI/flow is heads-up only.
 */
const ONLINE_MULTIPLAYER_GAME_IDS = new Set([
  'war',
  'go-fish',
  'skyjo',
  'demo-custom',
  'crazy-eights',
  'switch',
  'uno',
  'thirty-one',
  'pinochle',
  'canasta',
  'sequence-race',
])

export function gameSupportsOnlineMultiplayer(gameId: string): boolean {
  return ONLINE_MULTIPLAYER_GAME_IDS.has(gameId)
}

export function clampRemoteHumanCount(gameId: string, requested: number): number {
  let n = Math.floor(Number(requested))
  if (!Number.isFinite(n)) n = 0
  if (n < 0) n = 0
  if (!gameSupportsOnlineMultiplayer(gameId)) return 0
  const totalSeats = MAX_AI_OPPONENTS + 1
  return Math.min(MAX_REMOTE_HUMANS, Math.min(totalSeats - 1, n))
}

/**
 * Apply both remote human and AI counts to a manifest. Humans get slot 0 (host) and slots 1..remoteHumanCount.
 * AI seats occupy the remaining slots.
 */
export function manifestWithPlayerCounts(
  manifest: GameManifestYaml,
  gameId: string,
  counts: { aiCount?: number; remoteHumanCount?: number },
): GameManifestYaml {
  const remoteHumans = counts.remoteHumanCount
    ? clampRemoteHumanCount(gameId, counts.remoteHumanCount)
    : 0
  const human = 1 + remoteHumans
  let ai = manifest.players.ai
  if (counts.aiCount !== undefined && gameSupportsConfigurableAi(gameId)) {
    ai = clampAiOpponentCount(gameId, counts.aiCount)
  }
  if (remoteHumans === 0 && counts.aiCount === undefined) return manifest
  return {
    ...manifest,
    players: { human, ai },
  }
}
