import {
  advanceBackoffWhenInstanceOff,
  ensureSchedulerRowExists,
  getLiveAggregate,
  getSchedulerState,
  updateSchedulerAfterStopPoll,
} from './turnState'
import {
  describeTurnCapacity,
  stopTurnCapacity,
  turnRoute53Config,
  upsertTurnARecords,
} from './turnEc2Ops'

function maxUptimeMs(): number {
  const raw = process.env.TURN_MAX_UPTIME_SECONDS
  const n = raw ? Number(raw) : 60 * 60 * 4
  return Number.isFinite(n) && n > 0 ? n * 1000 : 60 * 60 * 4 * 1000
}

function usageGraceMs(): number {
  const raw = process.env.TURN_USAGE_GRACE_SECONDS
  const n = raw ? Number(raw) : 15 * 60
  return Number.isFinite(n) && n > 0 ? n * 1000 : 15 * 60 * 1000
}

/**
 * EventBridge scheduled handler: cheap no-op when nextPollAt is in the future;
 * may stop the TURN EC2 when uptime and idle conditions match (prefer staying on).
 */
export const handler = async (): Promise<void> => {
  await ensureSchedulerRowExists()
  const sched = await getSchedulerState()
  const nextAt = sched?.nextPollAt ?? 0
  if (Date.now() < nextAt) return

  let liveLast = 0
  try {
    const live = await getLiveAggregate()
    liveLast = live?.lastUsageAt ?? 0
  } catch (e) {
    console.warn('turn scheduled: skip stop; live read failed', e)
    return
  }

  const capacity = await describeTurnCapacity()
  if (!capacity.configured) return

  try {
    const r53 = turnRoute53Config()
    if (r53 && capacity.publicIps.length > 0) {
      await upsertTurnARecords(r53.hostedZoneId, r53.recordName, capacity.publicIps)
    }
  } catch (e) {
    console.warn('turn scheduled: DNS reconcile failed', e)
  }

  const state = capacity.state
  if (state === 'stopping') return

  if (state === 'stopped') {
    await advanceBackoffWhenInstanceOff(sched?.backoffStage ?? 0)
    return
  }

  if (state !== 'running') return

  const launchTimes = capacity.instances
    .filter((i) => i.state === 'running' && i.checksOk)
    .map((i) => i.launchTime?.getTime())
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
  if (launchTimes.length === 0) return

  const now = Date.now()
  if (now - Math.min(...launchTimes) < maxUptimeMs()) return

  if (liveLast > 0 && now - liveLast < usageGraceMs()) return

  try {
    await stopTurnCapacity()
    const r53 = turnRoute53Config()
    if (r53) await upsertTurnARecords(r53.hostedZoneId, r53.recordName, [])
    await updateSchedulerAfterStopPoll()
  } catch (e) {
    console.error('turn scheduled: scale down failed', e)
  }
}
