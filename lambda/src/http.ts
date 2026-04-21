import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { randomBytes } from 'node:crypto'
import { signRoomToken } from './auth'
import { generateRoomCode } from './roomCode'
import {
  handleGetTurnStatus,
  handlePostAbandonIdle,
  handlePostTurnHeartbeat,
  handlePostTurnStart,
} from './turnHttpHandlers'
import { getRoom, putRoom, ttlSecondsFromNow, type RoomMeta } from './storage'

const JSON_HEADERS = {
  'content-type': 'application/json',
}

function cors(origin?: string) {
  const allowed = process.env.ALLOWED_ORIGIN ?? '*'
  const match = allowed === '*' || !origin ? allowed : allowed.split(',').map((o) => o.trim()).includes(origin) ? origin : allowed
  return {
    'access-control-allow-origin': match,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  }
}

function bad(status: number, message: string, origin?: string): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: { ...JSON_HEADERS, ...cors(origin) },
    body: JSON.stringify({ message }),
  }
}

function ok(body: unknown, origin?: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: { ...JSON_HEADERS, ...cors(origin) },
    body: JSON.stringify(body),
  }
}

function getJwtSecret(): string {
  const s = process.env.ROOM_JWT_SECRET
  if (!s) throw new Error('ROOM_JWT_SECRET env var not set')
  return s
}

function getWsUrl(): string {
  const u = process.env.WS_PUBLIC_URL
  if (!u) throw new Error('WS_PUBLIC_URL env var not set')
  return u
}

function getRoomTtlSeconds(): number {
  const raw = process.env.ROOM_TTL_SECONDS
  const n = raw ? Number(raw) : 60 * 60 * 24
  return Number.isFinite(n) && n > 0 ? n : 60 * 60 * 24
}

interface CreateRoomRequest {
  gameId?: string
  maxClients?: number
}

interface JoinRoomRequest {
  roomCode?: string
}

function randomPeerSuffix(): string {
  return randomBytes(9).toString('base64url').slice(0, 12)
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const origin = event.headers?.origin ?? event.headers?.Origin
  const method = (event.requestContext.http.method ?? 'GET').toUpperCase()
  const path = event.requestContext.http.path ?? event.rawPath

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: { ...cors(origin) } }
  }

  try {
    if (method === 'GET' && path.endsWith('/turn/status')) {
      return await handleGetTurnStatus(origin)
    }

    if (method !== 'POST') return bad(405, 'Method not allowed', origin)

    let body: unknown = {}
    if (event.body) {
      try {
        body = JSON.parse(event.body)
      } catch {
        return bad(400, 'Malformed JSON', origin)
      }
    }

    if (path.endsWith('/rooms/abandon-idle')) return await handlePostAbandonIdle(body as { token?: string }, origin)
    if (path.endsWith('/rooms/join')) return await handleJoinRoom(body as JoinRoomRequest, origin)
    if (path.endsWith('/rooms')) return await handleCreateRoom(body as CreateRoomRequest, origin)
    if (path.endsWith('/turn/start')) return await handlePostTurnStart(origin)
    if (path.endsWith('/turn/heartbeat')) return await handlePostTurnHeartbeat(body as { token?: string }, origin)

    return bad(404, 'Not found', origin)
  } catch (err) {
    console.error('http handler error', err)
    return bad(500, 'Internal error', origin)
  }
}

async function handleCreateRoom(
  body: CreateRoomRequest,
  origin?: string,
): Promise<APIGatewayProxyResultV2> {
  const gameId = typeof body.gameId === 'string' && body.gameId.length > 0 ? body.gameId : 'unknown'
  const maxClientsRaw = Number(body.maxClients ?? 7)
  const maxClients = Math.min(Math.max(Math.floor(maxClientsRaw) || 1, 1), 7)

  const hostPeerId = `h-${randomPeerSuffix()}`
  const ttlSeconds = getRoomTtlSeconds()

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode()
    const meta: RoomMeta = {
      pk: `ROOM#${code}`,
      sk: 'META',
      roomCode: code,
      hostPeerId,
      gameId,
      maxClients,
      createdAt: Date.now(),
      ttl: ttlSecondsFromNow(ttlSeconds),
    }
    try {
      await putRoom(meta)
    } catch (err) {
      const name = (err as { name?: string })?.name
      if (name === 'ConditionalCheckFailedException') continue
      throw err
    }

    const token = signRoomToken(
      { roomCode: code, peerId: hostPeerId, role: 'host' },
      getJwtSecret(),
      ttlSeconds,
    )
    return ok({ roomCode: code, hostPeerId, token, wsUrl: getWsUrl() }, origin)
  }

  return bad(503, 'Could not allocate a room code, try again', origin)
}

async function handleJoinRoom(
  body: JoinRoomRequest,
  origin?: string,
): Promise<APIGatewayProxyResultV2> {
  const rc = typeof body.roomCode === 'string' ? body.roomCode.toUpperCase() : ''
  if (rc.length !== 6) return bad(400, 'Invalid room code', origin)

  const meta = await getRoom(rc)
  if (!meta) return bad(404, 'Room not found', origin)

  const clientPeerId = `c-${randomPeerSuffix()}`
  const ttlSeconds = getRoomTtlSeconds()
  const token = signRoomToken(
    { roomCode: rc, peerId: clientPeerId, role: 'client' },
    getJwtSecret(),
    ttlSeconds,
  )
  return ok(
    {
      roomCode: rc,
      hostPeerId: meta.hostPeerId,
      clientPeerId,
      token,
      wsUrl: getWsUrl(),
    },
    origin,
  )
}
