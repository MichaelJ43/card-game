import {
  advanceBackoffWhenInstanceOff,
  ensureSchedulerRowExists,
  getLiveAggregate,
  getSchedulerState,
  updateSchedulerAfterStopPoll,
} from './turnState'
import {
  describeInstanceState,
  instanceStatusChecksOk,
  stopTurnInstance,
  turnInstanceId,
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
  const instanceId = turnInstanceId()
  if (!instanceId) return

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

  let state: string | undefined
  let launchTime: Date | undefined
  try {
    const d = await describeInstanceState(instanceId)
    state = d.state
    launchTime = d.launchTime
  } catch (e) {
    console.warn('turn scheduled: describe failed', e)
    return
  }

  if (state === 'stopping') return

  if (state === 'stopped') {
    await advanceBackoffWhenInstanceOff(sched?.backoffStage ?? 0)
    return
  }

  if (state !== 'running') return

  const checksOk = await instanceStatusChecksOk(instanceId)
  if (!checksOk) return

  const launchMs = launchTime?.getTime()
  if (launchMs == null || !Number.isFinite(launchMs)) return

  const now = Date.now()
  if (now - launchMs < maxUptimeMs()) return

  if (liveLast > 0 && now - liveLast < usageGraceMs()) return

  try {
    await stopTurnInstance(instanceId)
    await updateSchedulerAfterStopPoll()
  } catch (e) {
    console.error('turn scheduled: stop failed', e)
  }
}
