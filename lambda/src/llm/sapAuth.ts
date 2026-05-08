import type { APIGatewayProxyEventV2 } from 'aws-lambda'

/** Default matches [shared-api-platform](https://github.com/MichaelJ43/shared-api-platform) dashboard / `VITE_API_BASE_URL`. */
export const DEFAULT_AUTH_PLATFORM_API_BASE = 'https://api.michaelj43.dev'

export function authPlatformApiBase(): string {
  const raw = process.env.AUTH_PLATFORM_API_BASE?.trim()
  return raw && raw.length > 0 ? raw.replace(/\/$/, '') : DEFAULT_AUTH_PLATFORM_API_BASE
}

/**
 * Cookie header for browser-originated requests (API Gateway v2 may use `cookies` array or `Cookie` header).
 */
export function cookieHeaderFromApiEvent(event: APIGatewayProxyEventV2): string | null {
  const fromArray = event.cookies
  if (Array.isArray(fromArray) && fromArray.length > 0) {
    return fromArray.join('; ')
  }
  const h = event.headers ?? {}
  const c =
    typeof h.cookie === 'string'
      ? h.cookie
      : typeof h.Cookie === 'string'
        ? h.Cookie
        : typeof h.COOKIE === 'string'
          ? h.COOKIE
          : null
  return c && c.trim() ? c.trim() : null
}

export interface SapUserBrief {
  id: string
  email: string
}

/**
 * Server-side session check: forwards `sap_session` (and other cookies) to shared-api-platform `GET /v1/auth/me`.
 */
export async function fetchSapAuthMe(cookieHeader: string | null): Promise<SapUserBrief | null> {
  if (!cookieHeader?.trim()) return null
  const base = authPlatformApiBase()
  const url = `${base}/v1/auth/me`
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 8_000)
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      signal: ac.signal,
    })
    if (r.status !== 200) return null
    const j = (await r.json()) as { user?: { id?: unknown; email?: unknown } }
    const u = j.user
    if (!u || typeof u.id !== 'string' || !u.id.trim() || typeof u.email !== 'string') {
      return null
    }
    return { id: u.id.trim(), email: u.email.trim() }
  } catch (e) {
    console.warn('fetchSapAuthMe failed', e)
    return null
  } finally {
    clearTimeout(t)
  }
}
