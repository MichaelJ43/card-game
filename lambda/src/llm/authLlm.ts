import jwt from 'jsonwebtoken'

export interface LlmAccessClaims {
  sub: string
  typ?: string
}

const CLAIM_TYPE = 'llm-access'

export function signLlmAccessToken(
  subject: string,
  secret: string,
  ttlSeconds = 60 * 60 * 12,
): string {
  return jwt.sign({ typ: CLAIM_TYPE, sub: subject }, secret, {
    expiresIn: ttlSeconds,
    algorithm: 'HS256',
    issuer: 'card-game',
    audience: 'card-game-llm',
  })
}

export function verifyLlmAccessToken(token: string, secret: string): LlmAccessClaims {
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: 'card-game',
    audience: 'card-game-llm',
  })
  if (typeof decoded === 'string') throw new Error('Invalid token payload')
  const claims = decoded as jwt.JwtPayload & { sub?: string; typ?: string }
  if (!claims.sub || typeof claims.sub !== 'string') {
    throw new Error('Invalid llm token subject')
  }
  return { sub: claims.sub, typ: typeof claims.typ === 'string' ? claims.typ : undefined }
}
