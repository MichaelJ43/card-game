import { verifyRoomToken } from './auth'
import { deleteRoomCascade, getRoom, listConnections } from './storage'
import {
  describeInstanceState,
  instanceStatusChecksOk,
  startTurnInstance,
  turnInstanceId,
  turnRoute53Config,
  upsertTurnARecord,
  waitForRunningReady,
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

export async function handleGetTurnStatus(origin?: string) {
  const instanceId = turnInstanceId()
  if (!instanceId) return ok({ enabled: false, reason: 'not_configured' }, origin)
  try {
    await ensureSchedulerRowExists()
    const sched = await getSchedulerState()
    const { state, publicIp } = await describeInstanceState(instanceId)
    if (state !== 'running') {
      return ok(
        {
          enabled: true,
          state: state ?? 'unknown',
          ready: false,
          publicIp: publicIp ?? null,
        },
        origin,
      )
    }
    const checksOk = await instanceStatusChecksOk(instanceId)
    const dnsTarget = sched?.lastDnsIpv4
    const dnsAligned = !dnsTarget || !publicIp || dnsTarget === publicIp
    return ok(
      {
        enabled: true,
        state: 'running',
        ready: checksOk && !!publicIp && dnsAligned,
        publicIp: publicIp ?? null,
      },
      origin,
    )
  } catch (e) {
    console.error('turn status', e)
    return ok({ enabled: true, state: 'error', ready: false }, origin)
  }
}

export async function handlePostTurnStart(origin?: string) {
  const instanceId = turnInstanceId()
  if (!instanceId) return bad(400, 'TURN EC2 not configured', origin)
  await ensureSchedulerRowExists()
  await resetSchedulerBackoff()
  try {
    await startTurnInstance(instanceId)
  } catch (e) {
    console.error('start instance', e)
    return bad(500, 'Failed to start instance', origin)
  }
  const ready = await waitForRunningReady(instanceId, { maxWaitMs: 180_000, pollMs: 3000 })
  if ('error' in ready) {
    return ok({ enabled: true, state: 'pending', ready: false, message: ready.error }, origin)
  }
  const r53 = turnRoute53Config()
  if (r53) {
    try {
      await upsertTurnARecord(r53.hostedZoneId, r53.recordName, ready.publicIp)
    } catch (e) {
      console.error('route53', e)
      return bad(500, 'Instance is up but DNS update failed', origin)
    }
  }
  const prev = await getSchedulerState()
  const next: TurnSchedulerState = {
    pk: TURN_SCHEDULER_PK,
    sk: TURN_SCHEDULER_SK,
    nextPollAt: Date.now(),
    backoffStage: 0,
    lastInstanceState: 'running',
    lastDnsIpv4: ready.publicIp,
  }
  if (prev?.lastStopAt) next.lastStopAt = prev.lastStopAt
  await putSchedulerState(next)
  return ok({ enabled: true, state: 'running', ready: true, publicIp: ready.publicIp, estimatedSeconds: 120 }, origin)
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
