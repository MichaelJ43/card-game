import type { AiDifficulty, SelectAiContext } from '../core/aiContext'
import type { GameAction } from '../core/types'
import type { GameSession } from '../session'
import { trackLlmTableInference } from '../analytics/llmTableAnalytics'
import { buildTableDigest } from '../llm/tableDigest'
import { requestLlmMove } from '../net/llmApi'

function difficultyForAiPlayer(session: GameSession, playerIndex: number): AiDifficulty {
  const i = playerIndex - session.manifest.players.human
  return session.aiPlayerConfig?.difficulties?.[i] ?? 'medium'
}

export interface PickTableAiOpts {
  useLlm: boolean
  /** Backend session JWT (after Google Sign-In exchange). Required when useLlm is true. */
  llmBearerToken: string | null
  selectAiContext: SelectAiContext
}

/**
 * Uses the cloud LLM when enabled & signed in & solo table; falls back to heuristics module.selectAiAction.
 */
export async function pickTableAiAction(
  session: GameSession,
  playerIndex: number,
  opts: PickTableAiOpts,
): Promise<GameAction | null> {
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
    return heuristics()
  }

  try {
    const legal = session.module.getLegalActions(session.table, session.gameState)
    if (!legal.length) return null

    const choices = legal.slice(0, 80).map((action: GameAction, index: number) => ({
      index,
      label: JSON.stringify(action).slice(0, 400),
    }))

    const tableDigest = buildTableDigest(session.table)
    const res = await requestLlmMove(opts.llmBearerToken, {
      provider: 'gemini',
      gameId,
      moduleId: String(session.manifest.module),
      playerIndex,
      difficulty: difficultyForAiPlayer(session, playerIndex),
      tableDigest,
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
      return heuristics()
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
    return act
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
    return heuristics()
  }
}
