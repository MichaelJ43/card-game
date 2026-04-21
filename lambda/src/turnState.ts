import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { backoffDelayMs } from './turnBackoff'
import { ddb } from './storage'

const TABLE = () => {
  const name = process.env.ROOMS_TABLE
  if (!name) throw new Error('ROOMS_TABLE env var is not set')
  return name
}

export const TURN_SCHEDULER_PK = 'TURN#SCHEDULER'
export const TURN_SCHEDULER_SK = 'STATE'
export const TURN_LIVE_PK = 'TURN#LIVE'
export const TURN_LIVE_SK = 'AGG'

export interface TurnSchedulerState {
  pk: typeof TURN_SCHEDULER_PK
  sk: typeof TURN_SCHEDULER_SK
  /** Epoch ms — Lambda returns immediately if Date.now() < nextPollAt */
  nextPollAt: number
  backoffStage: number
  /** Last observed EC2 state name (pending, running, stopped, …) */
  lastInstanceState?: string
  /** Epoch ms when we last successfully issued StopInstances */
  lastStopAt?: number
  /** Last public IPv4 we wrote to Route 53 (for ready check) */
  lastDnsIpv4?: string
}

export interface TurnLiveAggregate {
  pk: typeof TURN_LIVE_PK
  sk: typeof TURN_LIVE_SK
  /** Max of all client usage heartbeats */
  lastUsageAt: number
}

export async function getSchedulerState(): Promise<TurnSchedulerState | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { pk: TURN_SCHEDULER_PK, sk: TURN_SCHEDULER_SK },
    }),
  )
  return res.Item as TurnSchedulerState | undefined
}

export async function putSchedulerState(state: TurnSchedulerState): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE(), Item: state }))
}

/** Reset backoff after user starts EC2 (or first deploy). */
export async function resetSchedulerBackoff(): Promise<void> {
  const now = Date.now()
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { pk: TURN_SCHEDULER_PK, sk: TURN_SCHEDULER_SK },
      UpdateExpression: 'SET nextPollAt = :n, backoffStage = :z',
      ExpressionAttributeValues: { ':n': now, ':z': 0 },
    }),
  )
}

export async function ensureSchedulerRowExists(): Promise<void> {
  const existing = await getSchedulerState()
  if (existing) return
  const initial: TurnSchedulerState = {
    pk: TURN_SCHEDULER_PK,
    sk: TURN_SCHEDULER_SK,
    nextPollAt: 0,
    backoffStage: 0,
  }
  await ddb.send(
    new PutCommand({
      TableName: TABLE(),
      Item: initial,
      ConditionExpression: 'attribute_not_exists(pk)',
    }),
  ).catch(() => {})
}

export async function updateSchedulerAfterStopPoll(): Promise<void> {
  const now = Date.now()
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { pk: TURN_SCHEDULER_PK, sk: TURN_SCHEDULER_SK },
      UpdateExpression: 'SET nextPollAt = :n',
      ExpressionAttributeValues: { ':n': now + 15 * 60 * 1000 },
    }),
  )
}

/** While EC2 is off, space out future polls, then bump stage. */
export async function advanceBackoffWhenInstanceOff(stage: number): Promise<void> {
  const delayMs = backoffDelayMs(stage)
  const nextPollAt = Date.now() + delayMs
  const nextStage = Math.min(stage + 1, 10)
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { pk: TURN_SCHEDULER_PK, sk: TURN_SCHEDULER_SK },
      UpdateExpression: 'SET nextPollAt = :n, backoffStage = :s',
      ExpressionAttributeValues: { ':n': nextPollAt, ':s': nextStage },
    }),
  )
}

export async function getLiveAggregate(): Promise<TurnLiveAggregate | undefined> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { pk: TURN_LIVE_PK, sk: TURN_LIVE_SK },
    }),
  )
  return res.Item as TurnLiveAggregate | undefined
}

export async function touchUsageHeartbeat(): Promise<void> {
  const now = Date.now()
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { pk: TURN_LIVE_PK, sk: TURN_LIVE_SK },
      UpdateExpression: 'SET lastUsageAt = :t',
      ExpressionAttributeValues: { ':t': now },
    }),
  )
}

export async function ensureLiveRow(): Promise<void> {
  const existing = await getLiveAggregate()
  if (existing) return
  await ddb.send(
    new PutCommand({
      TableName: TABLE(),
      Item: {
        pk: TURN_LIVE_PK,
        sk: TURN_LIVE_SK,
        lastUsageAt: 0,
      } satisfies TurnLiveAggregate,
      ConditionExpression: 'attribute_not_exists(pk)',
    }),
  ).catch(() => {})
}
