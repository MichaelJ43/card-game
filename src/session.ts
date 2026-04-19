import { buildDeckInstances, parseDeckYaml } from './core/deck'
import type { GameModule } from './core/gameModule'
import { applyFinishedRound, createInitialMatchState } from './core/match'
import type { MatchState } from './core/match'
import { parseGameManifestYaml } from './core/loadYaml'
import { getGameModule } from './core/registry'
import { DECK_SOURCES, GAME_SOURCES } from './data/manifests'
import type { AiDifficulty } from './core/aiContext'
import type { GameManifestYaml, TableState } from './core/types'
import {
  manifestWithAiOpponents,
  normalizeAiDifficultiesForCount,
  type CreateSessionOptions,
} from './session/playerConfig'

export type { MatchState } from './core/match'
export type { CreateSessionOptions } from './session/playerConfig'

/** Locked at deal time; `difficulties[i]` is for human player index `i + 1`. */
export interface AiPlayerConfig {
  difficulties: AiDifficulty[]
}

export interface GameSession<T = unknown> {
  manifest: GameManifestYaml
  module: GameModule<T>
  table: TableState
  gameState: T
  /** Present when manifest.match.enabled and this session tracks cumulative scoring. */
  match?: MatchState
  /** Per-AI-seat difficulty for this deal; undefined if no AI players. */
  aiPlayerConfig?: AiPlayerConfig
}

export function createSession(
  gameId: keyof typeof GAME_SOURCES,
  rng = Math.random,
  carryMatch?: MatchState,
  options?: CreateSessionOptions,
): GameSession {
  const raw = GAME_SOURCES[gameId]
  if (!raw) throw new Error(`Unknown game: ${gameId}`)

  let manifest = parseGameManifestYaml(raw)
  manifest = manifestWithAiOpponents(manifest, gameId, options?.aiCount)
  const nAi = manifest.players.ai
  const aiPlayerConfig: AiPlayerConfig | undefined =
    nAi > 0
      ? { difficulties: normalizeAiDifficultiesForCount(nAi, options?.aiDifficulties) }
      : undefined
  const deckRaw = DECK_SOURCES[manifest.deck]
  if (!deckRaw) throw new Error(`Unknown deck: ${manifest.deck}`)

  const { templates } = parseDeckYaml(deckRaw)
  const instances = buildDeckInstances(templates)
  const mod = getGameModule(manifest.module)
  if (!mod) throw new Error(`Game module not registered: ${manifest.module}`)

  const match: MatchState | undefined =
    options?.skipMatch === true ? undefined : carryMatch ?? createInitialMatchState(manifest)

  const { table, gameState } = mod.setup(
    { manifest, templates, rng, matchCumulativeScores: match?.cumulativeScores },
    instances,
  )
  return { manifest, module: mod as GameModule, table, gameState, match, aiPlayerConfig }
}

/**
 * Merge the finished round into cumulative scores and either end the match or deal the next round.
 * Requires {@link GameModule.extractMatchRoundScores} and {@link GameModule.isMatchRoundFinished}.
 */
export function startNextMatchRound(
  prev: GameSession,
  gameId: keyof typeof GAME_SOURCES,
  rng = Math.random,
): GameSession {
  const mod = prev.module
  const gs = prev.gameState
  const match = prev.match
  if (!match) {
    throw new Error('No match state — enable match in the game YAML')
  }
  if (!mod.extractMatchRoundScores || !mod.isMatchRoundFinished) {
    throw new Error('This game does not support multi-round match scoring')
  }
  if (!mod.isMatchRoundFinished(gs)) {
    throw new Error('The current round is not finished yet')
  }
  const rs = mod.extractMatchRoundScores(gs)
  if (!rs || rs.length === 0) {
    throw new Error('No per-player round scores available')
  }

  const nextMatch = applyFinishedRound(match, rs)
  if (nextMatch.complete) {
    return { ...prev, match: nextMatch }
  }
  return createSession(gameId, rng, nextMatch, {
    aiCount: prev.manifest.players.ai,
    aiDifficulties: prev.aiPlayerConfig?.difficulties,
  })
}
