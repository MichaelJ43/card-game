import type { AiDifficulty, SelectAiContext } from '../core/aiContext'
import type { GameAction } from '../core/types'
import type { GameSession } from '../session'
import { trackLlmTableInference } from '../analytics/llmTableAnalytics'
import { buildRoleAwareTableObservation } from '../llm/roleAwareObservation'
import {
  heuristicCatalogExcerpt,
  houseRulesPayload,
  matchContextPayload,
  moveHistoryPayload,
  rulesDigestForGame,
} from '../llm/llmContextPayload'
import { requestLlmMove } from '../net/llmApi'
import type { MoveActorPolicy } from '../session/moveLedger'

function difficultyForAiPlayer(session: GameSession, playerIndex: number): AiDifficulty {
  const i = playerIndex - session.manifest.players.human
  return session.aiPlayerConfig?.difficulties?.[i] ?? 'medium'
}

export function selectAiContextForSession(session: GameSession, playerIndex: number): SelectAiContext {
  const difficulty = difficultyForAiPlayer(session, playerIndex)
  const m = session.match
  if (m?.cumulativeScores?.length) {
    return {
      difficulty,
      matchCumulativeScores: m.cumulativeScores,
      matchTargetScore: m.config.targetScore,
    }
  }
  return { difficulty }
}

export interface PickTableAiOpts {
  useLlm: boolean
  /** Backend session JWT (after Google Sign-In exchange). Required when useLlm is true. */
  llmBearerToken: string | null
  selectAiContext: SelectAiContext
}

export interface PickTableAiResult {
  action: GameAction | null
  /** Policy used for the returned action (LLM only when the cloud call succeeded). */
  policy: MoveActorPolicy
}

/**
 * Uses the cloud LLM when enabled & signed in & solo table; falls back to heuristics module.selectAiAction.
 */
export async function pickTableAiAction(
  session: GameSession,
  playerIndex: number,
  opts: PickTableAiOpts,
): Promise<PickTableAiResult> {
  const rng = Math.random
  const heuristics = (): GameAction | null =>
    session.module.selectAiAction(session.table, session.gameState, playerIndex, rng, opts.selectAiContext)

  const net = !!(session as { net?: unknown }).net
  const gameId = String(session.manifest.id)

  const t0 =
    typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()

  if (
    net ||
    !opts.useLlm ||
    !opts.llmBearerToken ||
    typeof opts.llmBearerToken !== 'string' ||
    opts.llmBearerToken.length < 8
  ) {
    return { action: heuristics(), policy: 'heuristic' }
  }

  try {
    const legal = session.module.getLegalActions(session.table, session.gameState)
    if (!legal.length) return { action: null, policy: 'heuristic' }

    const observation =
      session.module.buildLlmObservation?.(session.table, session.gameState, playerIndex) ??
      buildRoleAwareTableObservation(session.table, playerIndex)

    const choices = legal.slice(0, 80).map((action: GameAction, index: number) => {
      const described = session.module.describeLegalChoice?.(
        session.table,
        session.gameState,
        action,
        playerIndex,
      )
      const label =
        (described && described.trim().length > 0 ? described : JSON.stringify(action)).slice(0, 480)
      return { index, label }
    })

    const tableDigest = observation.slice(0, 7000)
    const rulesDigest = rulesDigestForGame(gameId)
    const houseRules = houseRulesPayload(gameId)
    const match = matchContextPayload(session)
    const moveHistory = moveHistoryPayload(session.moveLedger)
    const heuristicCatalog = heuristicCatalogExcerpt(gameId)

    const res = await requestLlmMove(opts.llmBearerToken, {
      provider: 'gemini',
      gameId,
      moduleId: String(session.manifest.module),
      playerIndex,
      difficulty: difficultyForAiPlayer(session, playerIndex),
      tableDigest,
      observation,
      rulesDigest,
      houseRules,
      match,
      moveHistory,
      heuristicCatalog,
      choices,
    })
    const act = legal[res.choiceIndex]
    if (!act) {
      trackLlmTableInference({
        ok: false,
        provider: 'gemini',
        gameId,
        reason: 'index_oob',
      })
      return { action: heuristics(), policy: 'heuristic' }
    }
    const elapsed =
      (typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()) - t0
    trackLlmTableInference({
      ok: true,
      provider: 'gemini',
      gameId,
      latencyMs: Math.round(elapsed),
      promptTokens: res.usage?.promptTokens,
      completionTokens: res.usage?.completionTokens,
      estimatedUsd: res.usage?.estimatedUsd,
      monthlySpendEstimatedUsd: res.monthlySpendEstimatedUsd,
    })
    return { action: act, policy: 'llm' }
  } catch (e) {
    const extras: Record<string, unknown> = { ok: false, provider: 'gemini', gameId }
    if (e instanceof Error) {
      extras.error = e.message.slice(0, 240)
      const code = (e as { code?: string }).code
      const llmU = (e as { llmUnavailable?: boolean }).llmUnavailable
      if (code) extras.code = code
      if (typeof llmU === 'boolean') extras.llmUnavailable = llmU
    }
    trackLlmTableInference(extras)
    return { action: heuristics(), policy: 'heuristic' }
  }
}
