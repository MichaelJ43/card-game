/**
 * Runtime configuration for multiplayer endpoints.
 * Populated from Vite env vars at build time:
 *   - VITE_MULTIPLAYER_HTTP_URL   → e.g. https://abc123.execute-api.us-east-1.amazonaws.com
 *   - VITE_MULTIPLAYER_WS_URL     → e.g. wss://def456.execute-api.us-east-1.amazonaws.com/prod, or wss://ws.example.com (no path) with API Gateway custom domain + mapping
 *   - VITE_MULTIPLAYER_STUN_URLS  → comma-separated STUN urls (default: Google public STUN)
 *
 * If HTTP/WS URLs are missing, multiplayer is disabled at runtime and the UI hides join/host.
 *
 * Important: read each `VITE_*` via **static** `import.meta.env.VITE_*` access. A helper like
 * `import.meta.env[key]` is not rewritten by Vite, so CI/deploy can export the vars correctly
 * while the production bundle would still see them as missing.
 */

function envString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length > 0 ? t : undefined
}

export interface MultiplayerConfig {
  httpUrl: string | undefined
  wsUrl: string | undefined
  stunUrls: string[]
}

export function getMultiplayerConfig(): MultiplayerConfig {
  const stunRaw = envString(import.meta.env.VITE_MULTIPLAYER_STUN_URLS)
  const stunUrls = stunRaw
    ? stunRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['stun:stun.l.google.com:19302']
  return {
    httpUrl: envString(import.meta.env.VITE_MULTIPLAYER_HTTP_URL),
    wsUrl: envString(import.meta.env.VITE_MULTIPLAYER_WS_URL),
    stunUrls,
  }
}

export function isMultiplayerConfigured(): boolean {
  const c = getMultiplayerConfig()
  return Boolean(c.httpUrl && c.wsUrl)
}
