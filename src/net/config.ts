/**
 * Runtime configuration for multiplayer endpoints.
 * Populated from Vite env vars at build time:
 *   - VITE_MULTIPLAYER_HTTP_URL   → e.g. https://abc123.execute-api.us-east-1.amazonaws.com
 *   - VITE_MULTIPLAYER_WS_URL     → e.g. wss://def456.execute-api.us-east-1.amazonaws.com/prod, or wss://ws.example.com (no path) with API Gateway custom domain + mapping
 *   - VITE_MULTIPLAYER_STUN_URLS  → comma-separated STUN urls (default: Google public STUN)
 *   - VITE_MULTIPLAYER_ICE_JSON   → optional JSON array of RTCIceServer objects (overrides STUN-only default)
 *   - VITE_MULTIPLAYER_TURN_HOST / TURN_USER / TURN_CREDENTIAL → optional long-term TURN (coturn) in addition to STUN (in GitHub Deploy, TURN_CREDENTIAL is set from secret TURN_COTURN_STATIC_PASSWORD alongside TF_VAR_turn_coturn_static_password)
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
  /** Effective ICE servers for WebRTC (STUN + optional TURN). */
  iceServers: RTCIceServer[]
}

function parseIceServersJson(): RTCIceServer[] | null {
  const raw = envString(import.meta.env.VITE_MULTIPLAYER_ICE_JSON)
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return null
    return v as RTCIceServer[]
  } catch {
    return null
  }
}

function buildDefaultIceServers(stunUrls: string[]): RTCIceServer[] {
  const fromJson = parseIceServersJson()
  if (fromJson && fromJson.length > 0) return fromJson
  const out: RTCIceServer[] = stunUrls.map((url) => ({ urls: url }))
  const host = envString(import.meta.env.VITE_MULTIPLAYER_TURN_HOST)
  const user = envString(import.meta.env.VITE_MULTIPLAYER_TURN_USER)
  const cred = envString(import.meta.env.VITE_MULTIPLAYER_TURN_CREDENTIAL)
  if (host && user && cred) {
    // UDP first; TCP fallback helps VPNs / networks that block UDP to TURN (coturn listens on 3478/tcp too).
    out.push({
      urls: [`turn:${host}:3478?transport=udp`, `turn:${host}:3478?transport=tcp`],
      username: user,
      credential: cred,
    })
  }
  return out
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
    iceServers: buildDefaultIceServers(stunUrls),
  }
}

export function isMultiplayerConfigured(): boolean {
  const c = getMultiplayerConfig()
  return Boolean(c.httpUrl && c.wsUrl)
}
