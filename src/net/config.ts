/**
 * Runtime configuration for multiplayer endpoints.
 * Populated from Vite env vars at build time:
 *   - VITE_MULTIPLAYER_HTTP_URL   → e.g. https://abc123.execute-api.us-east-1.amazonaws.com/prod
 *   - VITE_MULTIPLAYER_WS_URL     → e.g. wss://def456.execute-api.us-east-1.amazonaws.com/prod
 *   - VITE_MULTIPLAYER_STUN_URLS  → comma-separated STUN urls (default: Google public STUN)
 *
 * If HTTP/WS URLs are missing, multiplayer is disabled at runtime and the UI hides join/host.
 */

type ViteLikeEnv = Record<string, string | undefined> & { MODE?: string }

function readEnv(key: string): string | undefined {
  const meta = import.meta as unknown as { env?: ViteLikeEnv }
  const value = meta.env?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export interface MultiplayerConfig {
  httpUrl: string | undefined
  wsUrl: string | undefined
  stunUrls: string[]
}

export function getMultiplayerConfig(): MultiplayerConfig {
  const stunRaw = readEnv('VITE_MULTIPLAYER_STUN_URLS')
  const stunUrls = stunRaw
    ? stunRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['stun:stun.l.google.com:19302']
  return {
    httpUrl: readEnv('VITE_MULTIPLAYER_HTTP_URL'),
    wsUrl: readEnv('VITE_MULTIPLAYER_WS_URL'),
    stunUrls,
  }
}

export function isMultiplayerConfigured(): boolean {
  const c = getMultiplayerConfig()
  return Boolean(c.httpUrl && c.wsUrl)
}
