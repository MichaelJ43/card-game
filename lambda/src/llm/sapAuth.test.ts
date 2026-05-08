import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authPlatformApiBase, cookieHeaderFromApiEvent, fetchSapAuthMe } from './sapAuth'

describe('cookieHeaderFromApiEvent', () => {
  it('joins API Gateway v2 cookies array', () => {
    const ev = { cookies: ['sap_session=abc', 'other=x'] } as unknown as APIGatewayProxyEventV2
    expect(cookieHeaderFromApiEvent(ev)).toBe('sap_session=abc; other=x')
  })

  it('reads Cookie header', () => {
    const ev = { headers: { cookie: 'sap_session=zyx' } } as unknown as APIGatewayProxyEventV2
    expect(cookieHeaderFromApiEvent(ev)).toBe('sap_session=zyx')
  })
})

describe('fetchSapAuthMe', () => {
  const origFetch = globalThis.fetch

  beforeEach(() => {
    delete process.env.AUTH_PLATFORM_API_BASE
  })

  afterEach(() => {
    globalThis.fetch = origFetch
    vi.restoreAllMocks()
  })

  it('returns null when no cookie header', async () => {
    expect(await fetchSapAuthMe(null)).toBeNull()
  })

  it('parses user on 200', async () => {
    globalThis.fetch = vi.fn(async () => ({
      status: 200,
      json: async () => ({ user: { id: 'u1', email: 'a@b.c', role: 'user' } }),
    })) as unknown as typeof fetch

    const u = await fetchSapAuthMe('sap_session=test')
    expect(u).toEqual({ id: 'u1', email: 'a@b.c' })
    expect(fetch).toHaveBeenCalledWith(
      `${authPlatformApiBase()}/v1/auth/me`,
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: 'sap_session=test' }),
      }),
    )
  })

  it('returns null on 401', async () => {
    globalThis.fetch = vi.fn(async () => ({
      status: 401,
      json: async () => ({}),
    })) as unknown as typeof fetch
    expect(await fetchSapAuthMe('sap_session=x')).toBeNull()
  })
})
