import { getMultiplayerConfig } from '../net/config'

export interface AiCapabilitiesResponse {
  llmEnabled?: boolean
  budgetMode?: string
  googleSignInConfigured?: boolean
  geminiConfigured?: boolean
  monthlySpendEstimatedUsd?: number
  monthlyBudgetUsd?: number | null
  unlimitedBudget?: boolean
  authRequired?: boolean
}

function httpApiBase(): string | undefined {
  return getMultiplayerConfig().httpUrl?.replace(/\/$/, '')
}

export async function fetchAiCapabilities(): Promise<AiCapabilitiesResponse | null> {
  const base = httpApiBase()
  if (!base) return null
  const res = await fetch(`${base}/ai/capabilities`, { method: 'GET', credentials: 'omit' })
  if (!res.ok) return null
  return (await res.json()) as AiCapabilitiesResponse
}

export async function exchangeGoogleCredential(credential: string): Promise<{ token: string }> {
  const base = httpApiBase()
  if (!base) throw new Error('Multiplayer HTTP URL is not configured.')
  const res = await fetch(`${base}/ai/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify({ credential }),
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
    tableDigest: string
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
    credentials: 'omit',
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
