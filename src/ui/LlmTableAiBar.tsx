import { useEffect, useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import type { CredentialResponse } from '@react-oauth/google'
import { exchangeGoogleCredential, type AiCapabilitiesResponse } from '../net/llmApi'

const LS_KEY = 'card-game:llm-access-token:v1'

function envGoogleClientId(): string | undefined {
  const v = import.meta.env.VITE_GOOGLE_OAUTH_WEB_CLIENT_ID
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

export interface LlmTableAiBarProps {
  caps: AiCapabilitiesResponse | null
  configuredHttpApi: boolean
  enabled: boolean
  gameSupportsLlm: boolean
  onEnabledChange: (v: boolean) => void
  /** Non-null when authenticated for LLM. */
  accessToken: string | null
  onAccessTokenChange: (token: string | null) => void
}

/** Solo-table cloud LLM (Gemini behind HTTP API): sign-in + toggle + spend hint. */
export function LlmTableAiBar({
  caps,
  configuredHttpApi,
  enabled,
  gameSupportsLlm,
  onEnabledChange,
  accessToken,
  onAccessTokenChange,
}: LlmTableAiBarProps) {
  const clientId = envGoogleClientId()
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null
      if (raw && raw.trim()) onAccessTokenChange(raw.trim())
    } catch {
      /* ignore */
    }
  }, [onAccessTokenChange])

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

  const signInConfigured = !!(clientId && caps?.googleSignInConfigured && caps.llmEnabled)
  const canToggle = !!(signInConfigured && accessToken && caps?.llmEnabled)

  const onGoogleSuccess = async (cr: CredentialResponse) => {
    setAuthBusy(true)
    setAuthError(null)
    try {
      if (!cr.credential) throw new Error('Missing Google credential.')
      const { token } = await exchangeGoogleCredential(cr.credential)
      persistToken(token)
      onEnabledChange(true)
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e))
    } finally {
      setAuthBusy(false)
    }
  }

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
      {!clientId && (
        <span className="app__llmBarHint" title="Set VITE_GOOGLE_OAUTH_WEB_CLIENT_ID at build time.">
          Google client id not configured in this build.
        </span>
      )}
      {clientId && !caps?.googleSignInConfigured && (
        <span className="app__llmBarHint">
          Waiting for capability check — ensure the API publishes Google OAuth client ids.
        </span>
      )}
      {caps && !caps.llmEnabled && caps.budgetMode === 'off' && (
        <span className="app__llmBarHint">LLM is disabled on this deployment (budget 0).</span>
      )}
      {caps && !caps.llmEnabled && caps.budgetMode !== 'off' && !caps.geminiConfigured && (
        <span className="app__llmBarHint">Gemini key not deployed yet.</span>
      )}
      {caps?.llmEnabled && caps.googleSignInConfigured && clientId && (
        <>
          {!accessToken && (
            <GoogleLogin
              onSuccess={(c) => void onGoogleSuccess(c)}
              onError={() =>
                setAuthError('Google sign-in failed.')
              }
              useOneTap={false}
            />
          )}
          {accessToken && (
            <button
              type="button"
              className="app__btnSecondary app__btnToolbar"
              disabled={authBusy}
              onClick={() => {
                persistToken(null)
                onEnabledChange(false)
              }}
            >
              Sign out LLM
            </button>
          )}
        </>
      )}
      <label className="app__label app__label--inline app__label--llmCheck">
        <input
          type="checkbox"
          checked={enabled && canToggle}
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
      {authError && <span className="app__llmBarError">{authError}</span>}
    </div>
  )
}
