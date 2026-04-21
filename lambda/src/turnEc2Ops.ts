import {
  DescribeInstanceStatusCommand,
  DescribeInstancesCommand,
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand,
} from '@aws-sdk/client-ec2'
import { ChangeResourceRecordSetsCommand, Route53Client } from '@aws-sdk/client-route-53'

const ec2 = () => new EC2Client({})
const r53 = () => new Route53Client({})

export function turnInstanceId(): string | undefined {
  const id = process.env.TURN_EC2_INSTANCE_ID?.trim()
  return id && id.length > 0 ? id : undefined
}

export function turnRoute53Config(): { hostedZoneId: string; recordName: string } | undefined {
  const z = process.env.TURN_ROUTE53_ZONE_ID?.trim()
  const n = process.env.TURN_ROUTE53_RECORD_NAME?.trim()
  if (!z || !n) return undefined
  return { hostedZoneId: z, recordName: n.endsWith('.') ? n.slice(0, -1) : n }
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
  const name = recordName.endsWith('.') ? recordName : `${recordName}.`
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
              ResourceRecords: [{ Value: ipv4 }],
            },
          },
        ],
      },
    }),
  )
}
