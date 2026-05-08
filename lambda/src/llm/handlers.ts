import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { signLlmAccessToken, verifyLlmAccessToken } from './authLlm'
import { createGeminiProvider } from './geminiInference'
import { roughEstimateMicroUsdForPrompt, estimateUsdFromUsage } from './geminiCost'
import { getGeminiApiKey } from './geminiKey'
import { emitLlmMetric } from './metrics'
import { cookieHeaderFromApiEvent, fetchSapAuthMe } from './sapAuth'
import { buildTableAiUserPrompt, type LegalChoiceBrief } from './prompt'
import { parseChoiceIndexFromModelText } from './parseChoice'
import {
  ensureUnderBudget,
  getMonthlySpendUsd,
  incrementMonthlySpend,
  llmBudgetMode,
  monthlyBudgetUsd,
} from './spendTracking'

const JSON_HEADERS = {
  'content-type': 'application/json',
}

/** API Gateway rejects malformed header characters (e.g. newlines from TF_VAR). */
function singleLineHeader(s: string): string {
  return s.replace(/\r?\n/g, '').trim()
}

function safeStringify(body: unknown): string {
  try {
    return JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))
  } catch (e) {
    console.error('JSON stringify failed', e)
    return '{"message":"Serialization error"}'
  }
}

function corsForOrigin(origin: string | undefined) {
  const allowedRaw = singleLineHeader(process.env.ALLOWED_ORIGIN ?? '*')
  const allowedList = allowedRaw === '*' ? [] : allowedRaw.split(',').map((o) => o.trim()).filter(Boolean)
  const o = origin ? singleLineHeader(origin) : undefined
  const fallbackAcao = allowedList[0] ?? allowedRaw
  const match =
    allowedRaw === '*' || !o ? allowedRaw : allowedList.includes(o) ? o : fallbackAcao
  const headers: Record<string, string> = {
    'access-control-allow-origin': singleLineHeader(match),
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, cookie',
    vary: 'Origin',
  }
  if (match !== '*' && o) {
    headers['access-control-allow-credentials'] = 'true'
  }
  return headers
}

function bad(
  status: number,
  body: Record<string, unknown>,
  origin: string | undefined,
): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: { ...JSON_HEADERS, ...corsForOrigin(origin) },
    body: safeStringify(body),
  }
}

function ok(
  body: unknown,
  origin: string | undefined,
): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: { ...JSON_HEADERS, ...corsForOrigin(origin) },
    body: safeStringify(body),
  }
}

function getJwtSecret(): string {
  const s = process.env.ROOM_JWT_SECRET
  if (!s) throw new Error('ROOM_JWT_SECRET env var not set')
  return s
}

function bearerFromEvent(event: APIGatewayProxyEventV2): string | null {
  const h = event.headers ?? {}
  const raw =
    typeof h.authorization === 'string'
      ? h.authorization
      : typeof h.Authorization === 'string'
        ? h.Authorization
        : null
  if (!raw || !raw.toLowerCase().startsWith('bearer ')) return null
  return raw.slice(7).trim() || null
}

function geminiModel(): string {
  const m = process.env.GEMINI_MODEL_ID?.trim()
  return m && m.length > 0 ? m : 'gemini-2.5-flash-lite'
}

export async function handleGetAiCapabilities(
  event: APIGatewayProxyEventV2,
  origin: string | undefined,
): Promise<APIGatewayProxyResultV2> {
  try {
    const mode = llmBudgetMode()
    const keyConfigured = !!(await getGeminiApiKey())
    const spend = await getMonthlySpendUsd()
    const spentUsd = spend.estimatedMicroUsd / 1e6
    const cap = monthlyBudgetUsd()
    const llmBackendReady = mode !== 'off' && keyConfigured

    const cookies = cookieHeaderFromApiEvent(event)
    const sap = await fetchSapAuthMe(cookies)
    const authSessionValid = !!sap
    const llmEnabled = llmBackendReady && authSessionValid

    return ok(
      {
        llmEnabled,
        authSessionValid,
        llmBackendReady,
        budgetMode: mode,
        geminiConfigured: keyConfigured,
        monthlySpendEstimatedUsd: spentUsd,
        monthlyBudgetUsd: cap,
        unlimitedBudget: mode === 'unlimited',
        authRequired: true,
      },
      origin,
    )
  } catch (e) {
    console.warn('capabilities read failed', e)
    return ok(
      {
        llmEnabled: false,
        authSessionValid: false,
        llmBackendReady: false,
        budgetMode: 'off',
        geminiConfigured: false,
        monthlySpendEstimatedUsd: 0,
        monthlyBudgetUsd: null,
        unlimitedBudget: false,
        authRequired: true,
      },
      origin,
    )
  }
}

export async function handlePostAiSession(
  event: APIGatewayProxyEventV2,
  _body: unknown,
  origin: string | undefined,
): Promise<APIGatewayProxyResultV2> {
  void _body
  try {
    if (llmBudgetMode() === 'off') {
      return bad(
        403,
        { message: 'LLM assistant is disabled for this deployment.', code: 'LLM_DISABLED' },
        origin,
      )
    }

    const sap = await fetchSapAuthMe(cookieHeaderFromApiEvent(event))
    if (!sap) {
      await emitLlmMetric({
        eventType: 'AuthDenied',
        provider: 'gemini',
      })
      return bad(
        401,
        {
          message: 'Valid shared auth session required (`sap_session` cookie). Sign in via auth.michaelj43.dev.',
          code: 'AUTH',
        },
        origin,
      )
    }

    const ttl = 60 * 60 * 12
    const token = signLlmAccessToken(sap.id, getJwtSecret(), ttl)
    return ok({ token, expiresInSeconds: ttl, tokenType: 'Bearer' }, origin)
  } catch (e) {
    console.error('ai session error', e)
    return bad(500, { message: 'Internal error', code: 'INTERNAL' }, origin)
  }
}

interface MoveBody {
  provider?: unknown
  gameId?: unknown
  moduleId?: unknown
  playerIndex?: unknown
  difficulty?: unknown
  tableDigest?: unknown
  observation?: unknown
  rulesDigest?: unknown
  houseRules?: unknown
  match?: unknown
  moveHistory?: unknown
  heuristicCatalog?: unknown
  choices?: unknown
}

function normalizeChoices(raw: unknown): LegalChoiceBrief[] | null {
  if (!Array.isArray(raw)) return null
  const out: LegalChoiceBrief[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') return null
    const index = (row as { index?: unknown }).index
    const label = (row as { label?: unknown }).label
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null
    if (typeof label !== 'string' || label.length < 1 || label.length > 640) return null
    out.push({ index, label })
  }
  out.sort((a, b) => a.index - b.index)
  for (let i = 0; i < out.length; i++) {
    if (out[i].index !== i) return null
  }
  if (out.length < 1) return null
  return out
}

export async function handlePostAiMove(
  event: APIGatewayProxyEventV2,
  body: unknown,
  origin: string | undefined,
): Promise<APIGatewayProxyResultV2> {
  const t0 = Date.now()
  if (llmBudgetMode() === 'off') {
    return bad(
      403,
      { message: 'LLM assistant is disabled for this deployment.', code: 'LLM_DISABLED', llmUnavailable: true },
      origin,
    )
  }

  const token = bearerFromEvent(event)
  if (!token) {
    await emitLlmMetric({ eventType: 'AuthDenied', provider: 'gemini' })
    return bad(
      401,
      { message: 'Authorization Bearer token required.', code: 'AUTH', llmUnavailable: true },
      origin,
    )
  }

  let claims: ReturnType<typeof verifyLlmAccessToken>
  try {
    claims = verifyLlmAccessToken(token, getJwtSecret())
  } catch {
    await emitLlmMetric({ eventType: 'AuthDenied', provider: 'gemini' })
    return bad(
      401,
      { message: 'Invalid or expired session token.', code: 'AUTH', llmUnavailable: true },
      origin,
    )
  }

  const sap = await fetchSapAuthMe(cookieHeaderFromApiEvent(event))
  if (!sap || sap.id !== claims.sub) {
    await emitLlmMetric({ eventType: 'AuthDenied', provider: 'gemini' })
    return bad(
      401,
      {
        message: 'Shared auth session expired or mismatched token. Sign in again.',
        code: 'AUTH_SESSION',
        llmUnavailable: true,
      },
      origin,
    )
  }

  const apiKey = await getGeminiApiKey()
  if (!apiKey) {
    return bad(
      503,
      { message: 'Gemini API key is not available.', code: 'MISSING_KEY', llmUnavailable: true },
      origin,
    )
  }

  const b = body as MoveBody
  if (typeof b.provider !== 'string' || b.provider !== 'gemini') {
    return bad(400, { message: 'provider must be "gemini"', code: 'BAD_REQUEST' }, origin)
  }
  if (typeof b.gameId !== 'string' || b.gameId.length < 2 || b.gameId.length > 64) {
    return bad(400, { message: 'gameId invalid', code: 'BAD_REQUEST' }, origin)
  }
  if (typeof b.moduleId !== 'string' || b.moduleId.length < 2 || b.moduleId.length > 64) {
    return bad(400, { message: 'moduleId invalid', code: 'BAD_REQUEST' }, origin)
  }
  if (typeof b.playerIndex !== 'number' || !Number.isInteger(b.playerIndex) || b.playerIndex < 0) {
    return bad(400, { message: 'playerIndex invalid', code: 'BAD_REQUEST' }, origin)
  }
  const difficulty =
    typeof b.difficulty === 'string' && b.difficulty.length > 0 && b.difficulty.length < 32
      ? b.difficulty
      : 'medium'
  const tableDigest =
    typeof b.tableDigest === 'string' && b.tableDigest.length > 0 ? b.tableDigest : '(empty)'
  const observation =
    typeof b.observation === 'string' && b.observation.length > 0 ? b.observation.slice(0, 12000) : ''
  const rulesDigest =
    typeof b.rulesDigest === 'string' && b.rulesDigest.length > 0 ? b.rulesDigest.slice(0, 12000) : ''
  const houseRulesJson =
    b.houseRules && typeof b.houseRules === 'object'
      ? JSON.stringify(b.houseRules).slice(0, 6000)
      : '{}'
  const matchJson =
    b.match === null || b.match === undefined
      ? 'null'
      : typeof b.match === 'object'
        ? JSON.stringify(b.match).slice(0, 4000)
        : 'null'
  const moveHistoryJson = Array.isArray(b.moveHistory)
    ? JSON.stringify(b.moveHistory).slice(0, 8000)
    : '[]'
  const heuristicCatalog =
    typeof b.heuristicCatalog === 'string' && b.heuristicCatalog.length > 0
      ? b.heuristicCatalog.slice(0, 6000)
      : ''
  const choices = normalizeChoices(b.choices)
  if (!choices || choices.length > 80) {
    return bad(400, { message: 'choices invalid', code: 'BAD_REQUEST' }, origin)
  }

  const userPrompt = buildTableAiUserPrompt({
    gameId: b.gameId,
    moduleId: b.moduleId,
    playerIndex: b.playerIndex,
    difficulty,
    tableDigest,
    observation,
    rulesDigest,
    houseRulesJson,
    matchJson,
    moveHistoryJson,
    heuristicCatalog,
    choices,
  })

  try {
    const rough = roughEstimateMicroUsdForPrompt(userPrompt, 384)
    await ensureUnderBudget(rough)
  } catch (e) {
    const code = typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : ''
    if (code === 'LLM_CAP_EXCEEDED') {
      await emitLlmMetric({
        eventType: 'CapBlocked',
        provider: 'gemini',
        gameId: b.gameId,
      })
      return bad(
        402,
        {
          message: 'Monthly estimated LLM spend cap reached.',
          code: 'CAP_EXCEEDED',
          llmUnavailable: true,
        },
        origin,
      )
    }
    return bad(
      403,
      { message: e instanceof Error ? e.message : 'LLM disabled.', code: 'LLM_DISABLED', llmUnavailable: true },
      origin,
    )
  }

  const provider = createGeminiProvider(apiKey, geminiModel())
  try {
    const result = await provider.infer({
      userPrompt,
      temperature: 0.2,
      maxOutputTokens: 128,
    })
    const parsed = parseChoiceIndexFromModelText(result.text, choices.length)
    if (parsed === null) {
      await emitLlmMetric({
        eventType: 'InferenceError',
        provider: provider.id,
        gameId: b.gameId,
        latencyMs: Date.now() - t0,
      })
      return bad(
        422,
        { message: 'Model reply could not be parsed.', code: 'BAD_MODEL_REPLY', raw: result.text.slice(0, 500) },
        origin,
      )
    }

    const pTok =
      typeof result.promptTokenCount === 'number'
        ? result.promptTokenCount
        : Math.max(32, Math.ceil(userPrompt.length / 4))
    const cTok =
      typeof result.completionTokenCount === 'number'
        ? result.completionTokenCount
        : Math.max(1, Math.ceil(result.text.length / 4))
    const usdActual = estimateUsdFromUsage(pTok, cTok)
    const deltaMicro = Math.ceil(usdActual * 1e6)

    try {
      await ensureUnderBudget(deltaMicro)
    } catch {
      await emitLlmMetric({
        eventType: 'CapBlocked',
        provider: provider.id,
        gameId: b.gameId,
        latencyMs: Date.now() - t0,
        promptTokens: pTok,
        outputTokens: cTok,
      })
      return bad(
        402,
        {
          message: 'Monthly cap would be exceeded after this call.',
          code: 'CAP_EXCEEDED',
          llmUnavailable: true,
        },
        origin,
      )
    }

    await incrementMonthlySpend(deltaMicro)
    await emitLlmMetric({
      eventType: 'InferenceSuccess',
      provider: provider.id,
      gameId: b.gameId,
      latencyMs: Date.now() - t0,
      estimatedMicroUsd: deltaMicro,
      promptTokens: pTok,
      outputTokens: cTok,
    })

    const spend = await getMonthlySpendUsd()
    return ok(
      {
        choiceIndex: parsed,
        usage: {
          promptTokens: pTok,
          completionTokens: cTok,
          estimatedUsd: usdActual,
        },
        monthKey: spend.monthKey,
        monthlySpendEstimatedUsd: spend.estimatedMicroUsd / 1e6,
      },
      origin,
    )
  } catch (e) {
    const code =
      typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : 'UNKNOWN'
    const billingLike = code === 'BILLING_OR_QUOTA' || code === 'RESOURCE_EXHAUSTED'
    await emitLlmMetric({
      eventType: 'InferenceError',
      provider: 'gemini',
      gameId: b.gameId,
      latencyMs: Date.now() - t0,
    })
    return bad(billingLike ? 402 : 502, {
      message: e instanceof Error ? e.message : 'Upstream LLM failure',
      code,
      llmUnavailable: billingLike,
    }, origin)
  }
}
