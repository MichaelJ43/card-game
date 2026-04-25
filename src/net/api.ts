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

export interface TurnStatusResponse {
  enabled: boolean
  mode?: 'instance' | 'asg'
  reason?: string
  state?: string
  ready?: boolean
  publicIp?: string | null
  publicIps?: string[]
  desiredCapacity?: number
  message?: string
}

function httpBase(): string {
  const { httpUrl } = getMultiplayerConfig()
  if (!httpUrl) throw new Error('Multiplayer HTTP URL not configured')
  return httpUrl.replace(/\/$/, '')
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${httpBase()}${path}`, {
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
      // ignore
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

export async function getTurnStatus(): Promise<TurnStatusResponse> {
  const res = await fetch(`${httpBase()}/turn/status`, { method: 'GET' })
  if (!res.ok) {
    return { enabled: false, reason: 'http_error' }
  }
  return (await res.json()) as TurnStatusResponse
}

export function startTurnServer(): Promise<TurnStatusResponse> {
  return post<TurnStatusResponse>('/turn/start', {})
}

export function turnHeartbeat(body: { token: string }): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>('/turn/heartbeat', body)
}

export function abandonIdleRoom(body: { token: string }): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>('/rooms/abandon-idle', body)
}

export function createRoom(input: { gameId: string; maxClients: number }): Promise<CreateRoomResponse> {
  return post<CreateRoomResponse>('/rooms', input)
}

export function joinRoom(input: { roomCode: string }): Promise<JoinRoomResponse> {
  return post<JoinRoomResponse>('/rooms/join', input)
}
