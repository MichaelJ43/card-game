import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

const raw = new DynamoDBClient({})
export const ddb = DynamoDBDocumentClient.from(raw, {
  marshallOptions: { removeUndefinedValues: true },
})

export interface RoomMeta {
  pk: string
  sk: 'META'
  roomCode: string
  hostPeerId: string
  gameId: string
  maxClients: number
  createdAt: number
  ttl: number
  hostConnectionId?: string
}

export interface ConnectionRecord {
  pk: string
  sk: string
  connectionId: string
  peerId: string
  role: 'host' | 'client'
  roomCode: string
  ttl: number
}

export interface ConnectionIndex {
  pk: string
  sk: 'IDX'
  connectionId: string
  roomCode: string
  peerId: string
  role: 'host' | 'client'
  ttl: number
}

export function roomPk(roomCode: string): string {
  return `ROOM#${roomCode}`
}

export function connSk(connectionId: string): string {
  return `CONN#${connectionId}`
}

export function connIndexPk(connectionId: string): string {
  return `CONNIDX#${connectionId}`
}

const TABLE = () => {
  const name = process.env.ROOMS_TABLE
  if (!name) throw new Error('ROOMS_TABLE env var is not set')
  return name
}

export async function putRoom(meta: RoomMeta): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE(),
      Item: meta,
      ConditionExpression: 'attribute_not_exists(pk)',
    }),
  )
}

export async function getRoom(roomCode: string): Promise<RoomMeta | undefined> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE(), Key: { pk: roomPk(roomCode), sk: 'META' } }),
  )
  return res.Item as RoomMeta | undefined
}

export async function updateHostConnection(
  roomCode: string,
  hostConnectionId: string,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { pk: roomPk(roomCode), sk: 'META' },
      UpdateExpression: 'SET hostConnectionId = :c',
      ExpressionAttributeValues: { ':c': hostConnectionId },
    }),
  )
}

export async function putConnection(conn: ConnectionRecord): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE(), Item: conn }))
  const idx: ConnectionIndex = {
    pk: connIndexPk(conn.connectionId),
    sk: 'IDX',
    connectionId: conn.connectionId,
    roomCode: conn.roomCode,
    peerId: conn.peerId,
    role: conn.role,
    ttl: conn.ttl,
  }
  await ddb.send(new PutCommand({ TableName: TABLE(), Item: idx }))
}

export async function getConnectionIndex(connectionId: string): Promise<ConnectionIndex | undefined> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE(), Key: { pk: connIndexPk(connectionId), sk: 'IDX' } }),
  )
  return res.Item as ConnectionIndex | undefined
}

export async function deleteConnection(roomCode: string, connectionId: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE(),
      Key: { pk: roomPk(roomCode), sk: connSk(connectionId) },
    }),
  )
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE(),
      Key: { pk: connIndexPk(connectionId), sk: 'IDX' },
    }),
  )
}

export async function listConnections(roomCode: string): Promise<ConnectionRecord[]> {
  const out: ConnectionRecord[] = []
  let exclusiveStartKey: Record<string, unknown> | undefined
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE(),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': roomPk(roomCode), ':prefix': 'CONN#' },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    )
    for (const item of res.Items ?? []) out.push(item as ConnectionRecord)
    exclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined
  } while (exclusiveStartKey)
  return out
}

export function ttlSecondsFromNow(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds
}
