import type {
  APIGatewayProxyWebsocketEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda'
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi'
import { verifyRoomToken } from './auth'
import {
  connSk,
  deleteConnection,
  getConnectionIndex,
  getRoom,
  listConnections,
  putConnection,
  roomPk,
  ttlSecondsFromNow,
  updateHostConnection,
  type ConnectionRecord,
} from './storage'

function mgmtClient(event: APIGatewayProxyWebsocketEventV2): ApiGatewayManagementApiClient {
  const { domainName, stage } = event.requestContext
  const endpoint = `https://${domainName}/${stage}`
  return new ApiGatewayManagementApiClient({ endpoint })
}

function getJwtSecret(): string {
  const s = process.env.ROOM_JWT_SECRET
  if (!s) throw new Error('ROOM_JWT_SECRET env var not set')
  return s
}

function getWsTtlSeconds(): number {
  const raw = process.env.WS_CONNECTION_TTL_SECONDS
  const n = raw ? Number(raw) : 60 * 60 * 2
  return Number.isFinite(n) && n > 0 ? n : 60 * 60 * 2
}

async function postTo(client: ApiGatewayManagementApiClient, connectionId: string, data: unknown): Promise<void> {
  try {
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(data)),
      }),
    )
  } catch (err) {
    const code = (err as { name?: string })?.name
    if (code === 'GoneException') {
      console.info('gone connection', connectionId)
    } else {
      console.warn('postToConnection failed', code, err)
    }
  }
}

export const handler = async (
  event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const routeKey = event.requestContext.routeKey
  const connectionId = event.requestContext.connectionId
  const client = mgmtClient(event)

  try {
    switch (routeKey) {
      case '$connect':
        return { statusCode: 200, body: '' }
      case '$disconnect':
        await onDisconnect(connectionId, client)
        return { statusCode: 200, body: '' }
      case '$default':
      default:
        await onMessage(connectionId, client, event.body ?? '')
        return { statusCode: 200, body: '' }
    }
  } catch (err) {
    console.error('ws handler error', err)
    await postTo(client, connectionId, { type: 'error', code: 'unknown', message: 'Internal error' })
    return { statusCode: 200, body: '' }
  }
}

interface PendingBinding {
  roomCode: string
  peerId: string
  role: 'host' | 'client'
}

async function onMessage(
  connectionId: string,
  client: ApiGatewayManagementApiClient,
  body: string,
): Promise<void> {
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    await postTo(client, connectionId, { type: 'error', code: 'unknown', message: 'Malformed JSON' })
    return
  }
  if (!data || typeof data !== 'object' || !('type' in data)) return

  const msg = data as { type: string } & Record<string, unknown>

  if (msg.type === 'hello') {
    await onHello(connectionId, client, msg)
  } else if (msg.type === 'relay') {
    await onRelay(connectionId, client, msg)
  } else {
    await postTo(client, connectionId, { type: 'error', code: 'unknown', message: `Unknown message ${msg.type}` })
  }
}

async function onHello(
  connectionId: string,
  client: ApiGatewayManagementApiClient,
  msg: Record<string, unknown>,
): Promise<void> {
  const token = String(msg.token ?? '')
  const roomCode = String(msg.roomCode ?? '')
  if (!token || !roomCode) {
    await postTo(client, connectionId, { type: 'error', code: 'bad-token', message: 'Missing token' })
    return
  }
  let claims
  try {
    claims = verifyRoomToken(token, getJwtSecret())
  } catch {
    await postTo(client, connectionId, { type: 'error', code: 'bad-token', message: 'Invalid token' })
    return
  }
  if (claims.roomCode !== roomCode) {
    await postTo(client, connectionId, { type: 'error', code: 'bad-token', message: 'Token/room mismatch' })
    return
  }

  const meta = await getRoom(roomCode)
  if (!meta) {
    await postTo(client, connectionId, { type: 'error', code: 'bad-room', message: 'Unknown room' })
    return
  }

  const conn: ConnectionRecord = {
    pk: roomPk(roomCode),
    sk: connSk(connectionId),
    connectionId,
    peerId: claims.peerId,
    role: claims.role,
    roomCode,
    ttl: ttlSecondsFromNow(getWsTtlSeconds()),
  }
  await putConnection(conn)

  if (claims.role === 'host') {
    await updateHostConnection(roomCode, connectionId)
  }

  const peers = await listConnections(roomCode)
  const hostPeerId = meta.hostPeerId
  const clientPeerIds = peers.filter((p) => p.role === 'client').map((p) => p.peerId)

  await postTo(client, connectionId, {
    type: 'welcome',
    roomCode,
    hostPeerId,
    clientPeerIds: claims.role === 'host' ? clientPeerIds : undefined,
  })

  if (claims.role === 'client') {
    const host = peers.find((p) => p.role === 'host')
    if (host) {
      await postTo(client, host.connectionId, { type: 'peer-joined', peerId: claims.peerId })
    }
  }
}

async function onRelay(
  connectionId: string,
  client: ApiGatewayManagementApiClient,
  msg: Record<string, unknown>,
): Promise<void> {
  const to = String(msg.to ?? '')
  const from = String(msg.from ?? '')
  if (!to || !from) return
  const binding = await findBinding(connectionId)
  if (!binding) {
    await postTo(client, connectionId, { type: 'error', code: 'bad-token', message: 'Not bound' })
    return
  }
  if (binding.peerId !== from) {
    await postTo(client, connectionId, { type: 'error', code: 'bad-token', message: 'Spoofed from-peer' })
    return
  }
  const peers = await listConnections(binding.roomCode)
  const target = peers.find((p) => p.peerId === to)
  if (!target) return
  await postTo(client, target.connectionId, {
    type: 'relay',
    to,
    from,
    payload: msg.payload ?? null,
  })
}

async function onDisconnect(
  connectionId: string,
  client: ApiGatewayManagementApiClient,
): Promise<void> {
  const binding = await findBinding(connectionId)
  if (!binding) return
  await deleteConnection(binding.roomCode, connectionId)
  const peers = await listConnections(binding.roomCode)
  const host = peers.find((p) => p.role === 'host')
  if (!host) return
  await postTo(client, host.connectionId, { type: 'peer-left', peerId: binding.peerId })
}

async function findBinding(connectionId: string): Promise<PendingBinding | undefined> {
  const idx = await getConnectionIndex(connectionId)
  if (!idx) return undefined
  return { roomCode: idx.roomCode, peerId: idx.peerId, role: idx.role }
}
