import jwt from 'jsonwebtoken'

export interface RoomTokenClaims {
  roomCode: string
  peerId: string
  role: 'host' | 'client'
  /** Seconds since epoch. */
  exp?: number
  iat?: number
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 4

export function signRoomToken(claims: RoomTokenClaims, secret: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  return jwt.sign(claims, secret, { expiresIn: ttlSeconds, algorithm: 'HS256' })
}

export function verifyRoomToken(token: string, secret: string): RoomTokenClaims {
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] })
  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload')
  }
  const claims = decoded as RoomTokenClaims
  if (!claims.roomCode || !claims.peerId || (claims.role !== 'host' && claims.role !== 'client')) {
    throw new Error('Invalid token claims')
  }
  return claims
}
