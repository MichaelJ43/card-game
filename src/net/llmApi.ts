import { getMultiplayerConfig } from '../net/config'

export interface AiCapabilitiesResponse {
  llmEnabled?: boolean
  /** True when `sap_session` is valid against shared-api-platform `GET /v1/auth/me`. */
  authSessionValid?: boolean
  /** Budget allows LLM and Gemini key is available (independent of sign-in). */
  llmBackendReady?: boolean
  budgetMode?: string
  geminiConfigured?: boolean
  monthlySpendEstimatedUsd?: number
  monthlyBudgetUsd?: number | null
  unlimitedBudget?: boolean
  authRequired?: boolean
}

function httpApiBase(): string | undefined {
  return getMultiplayerConfig().httpUrl?.replace(/\/$/, '')
}

function credentialedFetchInit(): RequestInit {
  return { credentials: 'include' as RequestCredentials }
}

export async function fetchAiCapabilities(): Promise<AiCapabilitiesResponse | null> {
  const base = httpApiBase()
  if (!base) return null
  const res = await fetch(`${base}/ai/capabilities`, { method: 'GET', ...credentialedFetchInit() })
  if (!res.ok) return null
  return (await res.json()) as AiCapabilitiesResponse
}

/** Exchange shared `sap_session` cookie for a short-lived LLM Bearer JWT (card-game API). */
export async function exchangeLlmSession(): Promise<{ token: string }> {
  const base = httpApiBase()
  if (!base) throw new Error('Multiplayer HTTP URL is not configured.')
  const res = await fetch(`${base}/ai/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...credentialedFetchInit(),
    body: JSON.stringify({}),
  })
  const data = (await res.json().catch(() => ({}))) as { token?: unknown; message?: unknown }
  if (!res.ok) {
    throw new Error(typeof data.message === 'string' ? data.message : `HTTP ${res.status}`)
  }
  if (typeof data.token !== 'string' || !data.token.trim()) {
    throw new Error('Invalid session token from server.')
  }
  return { token: data.token.trim() }
}

export async function requestLlmMove(
  bearerToken: string,
  payload: {
    provider: 'gemini'
    gameId: string
    moduleId: string
    playerIndex: number
    difficulty: string
    /** Legacy / short summary; server prefers `observation` when present. */
    tableDigest: string
    /** Role-aware table observation for this seat. */
    observation: string
    rulesDigest: string
    houseRules: Record<string, unknown>
    match: Record<string, unknown> | null
    moveHistory: unknown[]
    /** Extracted heuristic / opponent logic catalog for this game. */
    heuristicCatalog: string
    choices: { index: number; label: string }[]
  },
): Promise<{
  choiceIndex: number
  usage?: { promptTokens?: number; completionTokens?: number; estimatedUsd?: number }
  monthlySpendEstimatedUsd?: number
}> {
  const base = httpApiBase()
  if (!base) throw new Error('Multiplayer HTTP URL is not configured.')
  const res = await fetch(`${base}/ai/move`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${bearerToken}`,
    },
    ...credentialedFetchInit(),
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as {
    choiceIndex?: unknown
    message?: unknown
    code?: unknown
    llmUnavailable?: unknown
    usage?: { promptTokens?: number; completionTokens?: number; estimatedUsd?: number }
    monthlySpendEstimatedUsd?: number
  }
  if (!res.ok) {
    const err = new Error(typeof data.message === 'string' ? data.message : `HTTP ${res.status}`)
    ;(err as { code?: string; llmUnavailable?: boolean }).code =
      typeof data.code === 'string' ? data.code : undefined
    ;(err as { llmUnavailable?: boolean }).llmUnavailable = !!data.llmUnavailable
    throw err
  }
  if (typeof data.choiceIndex !== 'number' || !Number.isInteger(data.choiceIndex)) {
    throw new Error('Invalid move response.')
  }
  return {
    choiceIndex: data.choiceIndex,
    usage: data.usage,
    monthlySpendEstimatedUsd: data.monthlySpendEstimatedUsd,
  }
}
