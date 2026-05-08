import { useEffect, useState } from 'react'
import { exchangeLlmSession, type AiCapabilitiesResponse } from '../net/llmApi'

const LS_KEY = 'card-game:llm-access-token:v1'

function authSpaOrigin(): string {
  const v = import.meta.env.VITE_AUTH_ORIGIN
  return typeof v === 'string' && v.trim() ? v.trim().replace(/\/$/, '') : 'https://auth.michaelj43.dev'
}

export interface LlmTableAiBarProps {
  caps: AiCapabilitiesResponse | null
  /** Build has `VITE_MULTIPLAYER_HTTP_URL` so `/ai/*` can be called. */
  llmHttpConfigured: boolean
  /** Re-fetch `GET /ai/capabilities` (e.g. after signing in in another tab). */
  onRefreshCaps?: () => void
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
  llmHttpConfigured,
  onRefreshCaps,
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
    if (!caps?.authSessionValid || !caps?.llmEnabled) {
      setConnecting(false)
      return
    }
    if (accessToken) {
      setConnecting(false)
      return
    }

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
      setConnecting(false)
    }
  }, [caps?.authSessionValid, caps?.llmEnabled, accessToken, onAccessTokenChange])

  const persistToken = (t: string | null) => {
    try {
      if (t) localStorage.setItem(LS_KEY, t)
      else localStorage.removeItem(LS_KEY)
    } catch {
      /* ignore */
    }
    setConnecting(false)
    setSessionError(null)
    onAccessTokenChange(t)
  }

  if (!llmHttpConfigured || !gameSupportsLlm) return null

  const canToggle = !!(caps?.llmEnabled && accessToken && !connecting)

  const signInHref =
    typeof window !== 'undefined'
      ? `${authSpaOrigin()}/?returnUrl=${encodeURIComponent(window.location.href)}`
      : `${authSpaOrigin()}/`

  return (
    <div className="app__llmBar" role="group" aria-label="Cloud LLM table AI">
      <span className="app__llmBarTitle">Smarter AI</span>
      {caps === null && (
        <span className="app__llmBarHint">
          Checking cloud AI…
          {onRefreshCaps && (
            <>
              {' '}
              <button type="button" className="app__btnSecondary app__btnToolbar" onClick={() => onRefreshCaps()}>
                Refresh
              </button>
            </>
          )}
        </span>
      )}
      {caps && caps.authSessionValid === false && (
        <span className="app__llmBarHint">
          <a href={signInHref} target="_blank" rel="noreferrer">
            Sign in
          </a>{' '}
          for cloud moves.
        </span>
      )}
      {caps && caps.authSessionValid === false && onRefreshCaps && (
        <button type="button" className="app__btnSecondary app__btnToolbar" onClick={() => onRefreshCaps()}>
          Refresh
        </button>
      )}
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
      {caps?.authSessionValid && caps.llmEnabled && connecting && !accessToken && (
        <button
          type="button"
          className="app__btnSecondary app__btnToolbar"
          onClick={() => {
            persistToken(null)
            onEnabledChange(false)
          }}
        >
          Cancel connecting
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
      {sessionError && <span className="app__llmBarError">{sessionError}</span>}
    </div>
  )
}
