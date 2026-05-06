import { OAuth2Client } from 'google-auth-library'

const clientsByAudience = new Map<string, OAuth2Client>()

function clientForAudience(audience: string): OAuth2Client {
  let c = clientsByAudience.get(audience)
  if (!c) {
    c = new OAuth2Client(audience)
    clientsByAudience.set(audience, c)
  }
  return c
}

/**
 * Validates a Google Sign-In credential (JWT) for one of the configured web client IDs.
 */
export async function verifyGoogleCredential(idToken: string, audienceCsv: string): Promise<{ sub: string }> {
  const audiences = audienceCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!audiences.length) {
    throw new Error('Google OAuth is not configured (GOOGLE_OAUTH_WEB_CLIENT_IDS).')
  }
  let lastErr: unknown
  for (const aud of audiences) {
    try {
      const client = clientForAudience(aud)
      const ticket = await client.verifyIdToken({ idToken, audience: aud })
      const payload = ticket.getPayload()
      const sub = payload?.sub
      if (!sub) throw new Error('Missing Google sub')
      return { sub }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Invalid Google credential')
}
