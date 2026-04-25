import { verifyRoomToken } from './auth'
import { deleteRoomCascade, getRoom, listConnections } from './storage'
import {
  describeTurnCapacity,
  startTurnCapacity,
  turnRoute53Config,
  upsertTurnARecords,
  type TurnCapacityState,
} from './turnEc2Ops'
import {
  ensureLiveRow,
  ensureSchedulerRowExists,
  getSchedulerState,
  putSchedulerState,
  resetSchedulerBackoff,
  TURN_SCHEDULER_PK,
  TURN_SCHEDULER_SK,
  touchUsageHeartbeat,
  type TurnSchedulerState,
} from './turnState'
import { broadcastRoomClosingToConnections } from './wsRoomNotify'

const JSON_HEADERS = { 'content-type': 'application/json' }

function cors(origin: string | undefined, allowed: string) {
  const match =
    allowed === '*' || !origin
      ? allowed
      : allowed.split(',').map((o) => o.trim()).includes(origin)
        ? origin
        : allowed
  return {
    'access-control-allow-origin': match,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  }
}

function bad(status: number, message: string, origin?: string) {
  const allowed = process.env.ALLOWED_ORIGIN ?? '*'
  return {
    statusCode: status,
    headers: { ...JSON_HEADERS, ...cors(origin, allowed) },
    body: JSON.stringify({ message }),
  }
}

function ok(body: unknown, origin?: string) {
  const allowed = process.env.ALLOWED_ORIGIN ?? '*'
  return {
    statusCode: 200,
    headers: { ...JSON_HEADERS, ...cors(origin, allowed) },
    body: JSON.stringify(body),
  }
}

function jwtSecret(): string {
  const s = process.env.ROOM_JWT_SECRET
  if (!s) throw new Error('ROOM_JWT_SECRET env var not set')
  return s
}

async function publishTurnDns(capacity: TurnCapacityState): Promise<string | undefined> {
  if (!capacity.ready || capacity.publicIps.length === 0) return undefined
  const r53 = turnRoute53Config()
  if (!r53) return capacity.publicIps.join(',')
  await upsertTurnARecords(r53.hostedZoneId, r53.recordName, capacity.publicIps)
  return capacity.publicIps.join(',')
}

export async function handleGetTurnStatus(origin?: string) {
  try {
    await ensureSchedulerRowExists()
    const sched = await getSchedulerState()
    const capacity = await describeTurnCapacity()
    if (!capacity.configured) return ok({ enabled: false, reason: 'not_configured' }, origin)

    let dnsTarget = sched?.lastDnsIpv4
    if (capacity.ready) {
      const published = await publishTurnDns(capacity)
      if (published && published !== sched?.lastDnsIpv4) {
        const next: TurnSchedulerState = {
          pk: TURN_SCHEDULER_PK,
          sk: TURN_SCHEDULER_SK,
          nextPollAt: Date.now(),
          backoffStage: 0,
          lastInstanceState: capacity.state,
          lastDnsIpv4: published,
        }
        if (sched?.lastStopAt) next.lastStopAt = sched.lastStopAt
        await putSchedulerState(next)
        dnsTarget = published
      }
    }
    const currentTarget = capacity.publicIps.join(',')
    const dnsAligned = !dnsTarget || !currentTarget || dnsTarget === currentTarget
    return ok(
      {
        enabled: true,
        mode: capacity.mode,
        state: capacity.state,
        ready: capacity.ready && dnsAligned,
        publicIp: capacity.publicIps[0] ?? null,
        publicIps: capacity.publicIps,
        desiredCapacity: capacity.desiredCapacity,
      },
      origin,
    )
  } catch (e) {
    console.error('turn status', e)
    return ok({ enabled: true, state: 'error', ready: false }, origin)
  }
}

export async function handlePostTurnStart(origin?: string) {
  await ensureSchedulerRowExists()
  await resetSchedulerBackoff()
  try {
    const started = await startTurnCapacity()
    if (!started) return bad(400, 'TURN relay not configured', origin)
  } catch (e) {
    console.error('start relay capacity', e)
    return bad(500, 'Failed to start relay capacity', origin)
  }

  const capacity = await describeTurnCapacity()
  let published: string | undefined
  try {
    published = await publishTurnDns(capacity)
  } catch (e) {
    console.error('route53', e)
    return bad(500, 'Relay is starting but DNS update failed', origin)
  }
  const prev = await getSchedulerState()
  const next: TurnSchedulerState = {
    pk: TURN_SCHEDULER_PK,
    sk: TURN_SCHEDULER_SK,
    nextPollAt: Date.now(),
    backoffStage: 0,
    lastInstanceState: capacity.state,
  }
  if (published) next.lastDnsIpv4 = published
  if (prev?.lastStopAt) next.lastStopAt = prev.lastStopAt
  await putSchedulerState(next)
  return ok({
    enabled: true,
    mode: capacity.mode,
    state: capacity.state,
    ready: capacity.ready && Boolean(published),
    publicIp: capacity.publicIps[0] ?? null,
    publicIps: capacity.publicIps,
    estimatedSeconds: capacity.ready ? 0 : 120,
    message: capacity.ready ? undefined : 'Relay capacity requested; polling will report ready after EC2 and DNS are ready.',
  }, origin)
}

interface HeartbeatBody {
  token?: string
}

export async function handlePostTurnHeartbeat(body: HeartbeatBody, origin?: string) {
  const token = typeof body.token === 'string' ? body.token : ''
  if (!token) return bad(400, 'Missing token', origin)
  try {
    verifyRoomToken(token, jwtSecret())
  } catch {
    return bad(401, 'Invalid token', origin)
  }
  await ensureLiveRow()
  await touchUsageHeartbeat()
  return ok({ ok: true }, origin)
}

interface AbandonBody {
  token?: string
}

export async function handlePostAbandonIdle(body: AbandonBody, origin?: string) {
  const token = typeof body.token === 'string' ? body.token : ''
  if (!token) return bad(400, 'Missing token', origin)
  let claims
  try {
    claims = verifyRoomToken(token, jwtSecret())
  } catch {
    return bad(401, 'Invalid token', origin)
  }
  if (claims.role !== 'host') return bad(403, 'Host only', origin)
  const roomCode = claims.roomCode
  const meta = await getRoom(roomCode)
  if (!meta) return bad(404, 'Room not found', origin)
  if (meta.hostPeerId !== claims.peerId) return bad(403, 'Not the room host', origin)

  const peers = await listConnections(roomCode)
  await broadcastRoomClosingToConnections(peers, { type: 'room-closing', reason: 'idle_timeout' })
  await deleteRoomCascade(roomCode)
  return ok({ ok: true }, origin)
}
