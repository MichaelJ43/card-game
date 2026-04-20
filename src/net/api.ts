import { getMultiplayerConfig } from './config'

export interface CreateRoomResponse {
  roomCode: string
  hostPeerId: string
  token: string
  wsUrl: string
}

export interface JoinRoomResponse {
  roomCode: string
  hostPeerId: string
  clientPeerId: string
  token: string
  wsUrl: string
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const { httpUrl } = getMultiplayerConfig()
  if (!httpUrl) throw new Error('Multiplayer HTTP URL not configured')
  const res = await fetch(`${httpUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const data = await res.json()
      if (data && typeof data === 'object' && 'message' in data) {
        message = String((data as { message: unknown }).message ?? message)
      }
    } catch {
      // ignore JSON parse errors; fall back to status
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

export function createRoom(input: { gameId: string; maxClients: number }): Promise<CreateRoomResponse> {
  return post<CreateRoomResponse>('/rooms', input)
}

export function joinRoom(input: { roomCode: string }): Promise<JoinRoomResponse> {
  return post<JoinRoomResponse>('/rooms/join', input)
}
