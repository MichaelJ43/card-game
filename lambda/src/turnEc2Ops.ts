import {
  DescribeInstanceStatusCommand,
  DescribeInstancesCommand,
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand,
} from '@aws-sdk/client-ec2'
import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  SetDesiredCapacityCommand,
  type Instance as AsgInstance,
} from '@aws-sdk/client-auto-scaling'
import { ChangeResourceRecordSetsCommand, Route53Client } from '@aws-sdk/client-route-53'

const PLACEHOLDER_IPV4 = '127.0.0.1'

const ec2 = () => new EC2Client({})
const autoscaling = () => new AutoScalingClient({})
const r53 = () => new Route53Client({})

export type TurnControlMode = 'instance' | 'asg'

export interface TurnInstanceState {
  instanceId: string
  state: string | undefined
  publicIp: string | undefined
  launchTime: Date | undefined
  checksOk: boolean
}

export interface TurnCapacityState {
  mode: TurnControlMode
  configured: boolean
  state: string
  ready: boolean
  publicIps: string[]
  instances: TurnInstanceState[]
  desiredCapacity?: number
  minSize?: number
  maxSize?: number
}

export function turnControlMode(): TurnControlMode {
  return process.env.TURN_CONTROL_MODE === 'asg' || turnAsgName() ? 'asg' : 'instance'
}

export function turnInstanceId(): string | undefined {
  const id = process.env.TURN_EC2_INSTANCE_ID?.trim()
  return id && id.length > 0 ? id : undefined
}

export function turnAsgName(): string | undefined {
  const name = process.env.TURN_ASG_NAME?.trim()
  return name && name.length > 0 ? name : undefined
}

export function turnAsgMinSize(): number {
  const raw = process.env.TURN_ASG_MIN_SIZE
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

export function turnRoute53Config(): { hostedZoneId: string; recordName: string } | undefined {
  const z = process.env.TURN_ROUTE53_ZONE_ID?.trim()
  const n = process.env.TURN_ROUTE53_RECORD_NAME?.trim()
  if (!z || !n) return undefined
  return { hostedZoneId: z, recordName: n.endsWith('.') ? n.slice(0, -1) : n }
}

async function describeInstances(instanceIds: string[]): Promise<TurnInstanceState[]> {
  if (instanceIds.length === 0) return []
  const res = await ec2().send(new DescribeInstancesCommand({ InstanceIds: instanceIds }))
  const instances = (res.Reservations ?? []).flatMap((r) => r.Instances ?? [])
  const status = await ec2().send(
    new DescribeInstanceStatusCommand({ InstanceIds: instanceIds, IncludeAllInstances: true }),
  )
  const checks = new Map(
    (status.InstanceStatuses ?? []).map((s) => [
      s.InstanceId,
      s.SystemStatus?.Status === 'ok' && s.InstanceStatus?.Status === 'ok',
    ]),
  )
  return instances.map((inst) => ({
    instanceId: inst.InstanceId ?? '',
    state: inst.State?.Name,
    publicIp: inst.PublicIpAddress,
    launchTime: inst.LaunchTime,
    checksOk: checks.get(inst.InstanceId) ?? false,
  }))
}

export async function describeInstanceState(
  instanceId: string,
): Promise<{ state: string | undefined; publicIp: string | undefined; launchTime: Date | undefined }> {
  const res = await ec2().send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }))
  const inst = res.Reservations?.[0]?.Instances?.[0]
  return {
    state: inst?.State?.Name,
    publicIp: inst?.PublicIpAddress,
    launchTime: inst?.LaunchTime,
  }
}

export async function instanceStatusChecksOk(instanceId: string): Promise<boolean> {
  const res = await ec2().send(new DescribeInstanceStatusCommand({ InstanceIds: [instanceId], IncludeAllInstances: true }))
  const st = res.InstanceStatuses?.[0]
  if (!st) return false
  const sys = st.SystemStatus?.Status
  const ins = st.InstanceStatus?.Status
  return sys === 'ok' && ins === 'ok'
}

export async function startTurnInstance(instanceId: string): Promise<void> {
  await ec2().send(new StartInstancesCommand({ InstanceIds: [instanceId] }))
}

export async function stopTurnInstance(instanceId: string): Promise<void> {
  await ec2().send(new StopInstancesCommand({ InstanceIds: [instanceId] }))
}

export async function setTurnAsgDesiredCapacity(asgName: string, desiredCapacity: number): Promise<void> {
  await autoscaling().send(
    new SetDesiredCapacityCommand({
      AutoScalingGroupName: asgName,
      DesiredCapacity: desiredCapacity,
      HonorCooldown: false,
    }),
  )
}

async function describeTurnAsg(asgName: string): Promise<TurnCapacityState> {
  const res = await autoscaling().send(new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [asgName] }))
  const group = res.AutoScalingGroups?.[0]
  if (!group) {
    return {
      mode: 'asg',
      configured: true,
      state: 'not_found',
      ready: false,
      publicIps: [],
      instances: [],
    }
  }
  const active = (group.Instances ?? []).filter(
    (i: AsgInstance) =>
      i.InstanceId && i.LifecycleState !== 'Terminating' && i.LifecycleState !== 'Terminating:Wait',
  )
  const instances = await describeInstances(active.map((i) => i.InstanceId!).filter(Boolean))
  const publicIps = instances
    .filter((i) => i.state === 'running' && i.publicIp && i.checksOk)
    .map((i) => i.publicIp!)
  const desired = group.DesiredCapacity ?? 0
  const anyPending = instances.some((i) => i.state === 'pending')
  const anyRunning = instances.some((i) => i.state === 'running')
  const state = desired === 0 ? 'stopped' : publicIps.length > 0 ? 'running' : anyPending ? 'pending' : anyRunning ? 'running' : 'pending'
  return {
    mode: 'asg',
    configured: true,
    state,
    ready: publicIps.length > 0,
    publicIps,
    instances,
    desiredCapacity: desired,
    minSize: group.MinSize,
    maxSize: group.MaxSize,
  }
}

export async function describeTurnCapacity(): Promise<TurnCapacityState> {
  if (turnControlMode() === 'asg') {
    const asgName = turnAsgName()
    if (!asgName) {
      return { mode: 'asg', configured: false, state: 'not_configured', ready: false, publicIps: [], instances: [] }
    }
    return describeTurnAsg(asgName)
  }

  const instanceId = turnInstanceId()
  if (!instanceId) {
    return { mode: 'instance', configured: false, state: 'not_configured', ready: false, publicIps: [], instances: [] }
  }
  const [inst] = await describeInstances([instanceId])
  const publicIps = inst?.state === 'running' && inst.publicIp && inst.checksOk ? [inst.publicIp] : []
  return {
    mode: 'instance',
    configured: true,
    state: inst?.state ?? 'unknown',
    ready: publicIps.length > 0,
    publicIps,
    instances: inst ? [inst] : [],
  }
}

export async function startTurnCapacity(): Promise<boolean> {
  if (turnControlMode() === 'asg') {
    const asgName = turnAsgName()
    if (!asgName) return false
    const cap = await describeTurnAsg(asgName)
    await setTurnAsgDesiredCapacity(asgName, Math.max(1, cap.desiredCapacity ?? 0, cap.minSize ?? 0))
    return true
  }

  const instanceId = turnInstanceId()
  if (!instanceId) return false
  await startTurnInstance(instanceId)
  return true
}

export async function stopTurnCapacity(): Promise<boolean> {
  if (turnControlMode() === 'asg') {
    const asgName = turnAsgName()
    if (!asgName) return false
    await setTurnAsgDesiredCapacity(asgName, turnAsgMinSize())
    return true
  }

  const instanceId = turnInstanceId()
  if (!instanceId) return false
  await stopTurnInstance(instanceId)
  return true
}

/** Poll until running, has public IP, and status checks ok (or timeout). */
export async function waitForRunningReady(
  instanceId: string,
  opts: { maxWaitMs: number; pollMs: number },
): Promise<{ publicIp: string } | { error: string }> {
  const deadline = Date.now() + opts.maxWaitMs
  while (Date.now() < deadline) {
    const { state, publicIp } = await describeInstanceState(instanceId)
    if (state === 'running' && publicIp) {
      const ok = await instanceStatusChecksOk(instanceId)
      if (ok) return { publicIp }
    }
    await new Promise((r) => setTimeout(r, opts.pollMs))
  }
  return { error: 'timeout waiting for instance ready' }
}

export async function upsertTurnARecord(hostedZoneId: string, recordName: string, ipv4: string): Promise<void> {
  await upsertTurnARecords(hostedZoneId, recordName, [ipv4])
}

export async function upsertTurnARecords(hostedZoneId: string, recordName: string, ipv4s: string[]): Promise<void> {
  const name = recordName.endsWith('.') ? recordName : `${recordName}.`
  const records = (ipv4s.length > 0 ? ipv4s : [PLACEHOLDER_IPV4]).map((Value) => ({ Value }))
  await r53().send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Comment: 'card-game TURN EC2 public IP',
        Changes: [
          {
            Action: 'UPSERT',
            ResourceRecordSet: {
              Name: name,
              Type: 'A',
              TTL: 60,
              ResourceRecords: records,
            },
          },
        ],
      },
    }),
  )
}
