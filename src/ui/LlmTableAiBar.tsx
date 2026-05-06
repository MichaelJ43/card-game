import { useEffect, useState } from 'react'
import { exchangeLlmSession, type AiCapabilitiesResponse } from '../net/llmApi'

const LS_KEY = 'card-game:llm-access-token:v1'

export interface LlmTableAiBarProps {
  caps: AiCapabilitiesResponse | null
  configuredHttpApi: boolean
  enabled: boolean
  gameSupportsLlm: boolean
  onEnabledChange: (v: boolean) => void
  /** Non-null when authenticated for LLM (Bearer from card-game `/ai/session`). */
  accessToken: string | null
  onAccessTokenChange: (token: string | null) => void
}

/** Solo-table cloud LLM: requires shared-platform `sap_session` (see shared-api-platform `docs/auth-and-dashboard.md`). */
export function LlmTableAiBar({
  caps,
  configuredHttpApi,
  enabled,
  gameSupportsLlm,
  onEnabledChange,
  accessToken,
  onAccessTokenChange,
}: LlmTableAiBarProps) {
  const [connecting, setConnecting] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null
      if (raw && raw.trim()) onAccessTokenChange(raw.trim())
    } catch {
      /* ignore */
    }
  }, [onAccessTokenChange])

  useEffect(() => {
    if (!caps?.authSessionValid || !caps?.llmEnabled || accessToken) return

    let cancelled = false
    setConnecting(true)
    setSessionError(null)
    void exchangeLlmSession()
      .then(({ token }) => {
        if (cancelled) return
        try {
          localStorage.setItem(LS_KEY, token)
        } catch {
          /* ignore */
        }
        onAccessTokenChange(token)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setSessionError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setConnecting(false)
      })

    return () => {
      cancelled = true
    }
  }, [caps?.authSessionValid, caps?.llmEnabled, accessToken, onAccessTokenChange])

  const persistToken = (t: string | null) => {
    try {
      if (t) localStorage.setItem(LS_KEY, t)
      else localStorage.removeItem(LS_KEY)
    } catch {
      /* ignore */
    }
    onAccessTokenChange(t)
  }

  if (!configuredHttpApi || !gameSupportsLlm) return null

  const canToggle = !!(caps?.llmEnabled && accessToken && !connecting)

  const spendHint =
    typeof caps?.monthlySpendEstimatedUsd === 'number' && Number.isFinite(caps.monthlySpendEstimatedUsd)
      ? `Estimated month spend · $${caps.monthlySpendEstimatedUsd.toFixed(4)}`
      : ''

  const capHint =
    caps?.unlimitedBudget
      ? 'Budget · unlimited tracking'
      : typeof caps?.monthlyBudgetUsd === 'number' && caps.monthlyBudgetUsd != null && caps.monthlyBudgetUsd > 0
        ? `Cap · $${caps.monthlyBudgetUsd}`
        : ''

  return (
    <div className="app__llmBar" role="group" aria-label="Cloud LLM table AI">
      <span className="app__llmBarTitle">Smarter AI</span>
      {caps && !caps.llmEnabled && caps.budgetMode === 'off' && (
        <span className="app__llmBarHint">LLM is disabled on this deployment (budget 0).</span>
      )}
      {caps && caps.budgetMode !== 'off' && !caps.geminiConfigured && (
        <span className="app__llmBarHint">Gemini key not deployed yet.</span>
      )}
      {caps?.authSessionValid && caps.llmEnabled && connecting && (
        <span className="app__llmBarHint">Connecting…</span>
      )}
      {caps?.authSessionValid && caps.llmEnabled && accessToken && (
        <button
          type="button"
          className="app__btnSecondary app__btnToolbar"
          disabled={connecting}
          onClick={() => {
            persistToken(null)
            onEnabledChange(false)
          }}
        >
          Clear LLM session
        </button>
      )}
      <label className="app__label app__label--inline app__label--llmCheck">
        <input
          type="checkbox"
          checked={enabled && !!canToggle}
          disabled={!canToggle}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        Use cloud model
      </label>
      {(spendHint || capHint) && (
        <span className="app__llmBarMeta">
          {capHint}
          {capHint && spendHint ? ' · ' : ''}
          {spendHint}
        </span>
      )}
      {sessionError && <span className="app__llmBarError">{sessionError}</span>}
    </div>
  )
}
