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
  manifestWithPlayerCounts,
  normalizeAiDifficultiesForCount,
  type CreateSessionOptions,
} from './session/playerConfig'
import { clampMatchTargetScore, createSessionOptionsHouseRules, effectiveReshuffleDiscardWhenDrawEmpty } from './data/houseRules'
import type { RulesGameId } from './data/rulesSources'

export type { MatchState } from './core/match'
export type { CreateSessionOptions } from './session/playerConfig'

/** Locked at deal time; `difficulties[i]` is for human player index `i + 1`. */
export interface AiPlayerConfig {
  difficulties: AiDifficulty[]
}

/** Present when this session was built from a host snapshot (online client). */
export interface GameSessionNetMeta {
  /** Host roster / wire seat (1 for first remote client). */
  seat: number
  /** True when this client joined mid-deal and is not assigned a human slot yet. */
  spectator: boolean
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
  /** Set for browsers consuming a host snapshot over the network. */
  net?: GameSessionNetMeta
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
  manifest = manifestWithPlayerCounts(manifest, gameId, {
    aiCount: options?.aiCount,
    remoteHumanCount: options?.remoteHumanCount,
  })

  if (!carryMatch && options?.matchTargetScore != null && manifest.match?.enabled) {
    const def = typeof manifest.match.targetScore === 'number' ? manifest.match.targetScore : 100
    const t = clampMatchTargetScore(options.matchTargetScore, def)
    manifest = {
      ...manifest,
      match: { ...manifest.match!, targetScore: t },
    }
  }

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

  const reshuffleDiscardWhenDrawEmpty = effectiveReshuffleDiscardWhenDrawEmpty(
    gameId as RulesGameId,
    manifest,
    options,
  )

  const { table, gameState } = mod.setup(
    {
      manifest,
      templates,
      rng,
      matchCumulativeScores: match?.cumulativeScores,
      dealerHitsSoft17: options?.dealerHitsSoft17,
      warTieDownCards: options?.warTieDownCards,
      skyjoDiscardSwapFaceUpOnly: options?.skyjoDiscardSwapFaceUpOnly,
      reshuffleDiscardWhenDrawEmpty,
    },
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
  return createSession(gameId, rng, nextMatch, continuationOptionsFromSession(prev))
}

/** Preserve house rules and match threshold when dealing the next round. */
export function continuationOptionsFromSession(prev: GameSession): CreateSessionOptions {
  const gameId = prev.manifest.id as RulesGameId
  const base: CreateSessionOptions = {
    aiCount: prev.manifest.players.ai,
    aiDifficulties: prev.aiPlayerConfig?.difficulties,
    ...createSessionOptionsHouseRules(gameId),
  }
  if (prev.match) {
    base.matchTargetScore = prev.match.config.targetScore
  }
  const gs = prev.gameState as Record<string, unknown>
  if (prev.manifest.module === 'skyjo' && typeof gs.discardSwapFaceUpOnly === 'boolean') {
    base.skyjoDiscardSwapFaceUpOnly = gs.discardSwapFaceUpOnly
  }
  if (prev.manifest.module === 'blackjack' && typeof gs.dealerHitsSoft17 === 'boolean') {
    base.dealerHitsSoft17 = gs.dealerHitsSoft17
  }
  if (prev.manifest.module === 'war' && (gs.tieDownCards === 1 || gs.tieDownCards === 3)) {
    base.warTieDownCards = gs.tieDownCards
  }
  return base
}
