import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi'
import type { ConnectionRecord } from './storage'

function wsMgmtClient(): ApiGatewayManagementApiClient | null {
  const base = process.env.WS_MANAGEMENT_API_URL?.trim()
  if (!base) return null
  return new ApiGatewayManagementApiClient({ endpoint: base.replace(/\/$/, '') })
}

export async function postJsonToConnection(client: ApiGatewayManagementApiClient, connectionId: string, data: unknown) {
  try {
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(data)),
      }),
    )
  } catch (err) {
    const code = (err as { name?: string })?.name
    if (code !== 'GoneException') console.warn('postToConnection', code, err)
  }
}

/** Notify every signaling connection in the room, then caller deletes Dynamo rows. */
export async function broadcastRoomClosingToConnections(
  peers: ConnectionRecord[],
  message: { type: 'room-closing'; reason: string },
): Promise<void> {
  const client = wsMgmtClient()
  if (!client) {
    console.warn('WS_MANAGEMENT_API_URL not set; skipping room-closing push')
    return
  }
  await Promise.all(peers.map((p) => postJsonToConnection(client, p.connectionId, message)))
}
