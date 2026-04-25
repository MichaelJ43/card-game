import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const outDir = resolve(process.env.RELAY_PERF_OUT_DIR ?? 'relay-perf-results')
mkdirSync(outDir, { recursive: true })

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function optionalNumber(name, fallback) {
  const raw = process.env[name]?.trim()
  const n = raw ? Number(raw) : fallback
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  if (!res.ok) throw new Error(`${url} failed with HTTP ${res.status}: ${text}`)
  return data
}

async function getJson(url) {
  const res = await fetch(url)
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  if (!res.ok) throw new Error(`${url} failed with HTTP ${res.status}: ${text}`)
  return data
}

function commandExists(name) {
  const result = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' })
  return result.status === 0
}

function runTurnClient({ host, user, password, allocations, durationSeconds }) {
  if (!commandExists('turnutils_uclient')) {
    return {
      skipped: true,
      reason: 'turnutils_uclient is not installed on the runner',
    }
  }

  const startedAt = Date.now()
  const args = [
    '-y',
    '-u',
    user,
    '-w',
    password,
    '-n',
    String(Math.max(1, Math.floor(durationSeconds / 5))),
    '-m',
    String(allocations),
    '-l',
    '256',
    host,
  ]
  const result = spawnSync('turnutils_uclient', args, {
    encoding: 'utf8',
    timeout: (durationSeconds + 30) * 1000,
  })
  return {
    skipped: false,
    command: `turnutils_uclient ${args.map((a) => (a === password ? '<redacted>' : a)).join(' ')}`,
    exitCode: result.status,
    signal: result.signal,
    durationMs: Date.now() - startedAt,
    stdout: result.stdout.slice(-12000),
    stderr: result.stderr.slice(-12000),
  }
}

function collectAwsMetrics({ region, asgName, startIso, endIso }) {
  if (!asgName || !commandExists('aws')) return { skipped: true }
  try {
    const groupRaw = execFileSync(
      'aws',
      ['autoscaling', 'describe-auto-scaling-groups', '--auto-scaling-group-names', asgName, '--region', region, '--output', 'json'],
      { encoding: 'utf8' },
    )
    const group = JSON.parse(groupRaw)
    const instanceIds = group.AutoScalingGroups?.[0]?.Instances?.map((i) => i.InstanceId).filter(Boolean) ?? []
    const metrics = []
    for (const instanceId of instanceIds) {
      for (const metricName of ['CPUUtilization', 'NetworkIn', 'NetworkOut', 'NetworkPacketsIn', 'NetworkPacketsOut', 'CPUCreditBalance']) {
        const namespace = metricName === 'CPUCreditBalance' ? 'AWS/EC2' : 'AWS/EC2'
        const raw = execFileSync(
          'aws',
          [
            'cloudwatch',
            'get-metric-statistics',
            '--namespace',
            namespace,
            '--metric-name',
            metricName,
            '--dimensions',
            `Name=InstanceId,Value=${instanceId}`,
            '--start-time',
            startIso,
            '--end-time',
            endIso,
            '--period',
            '60',
            '--statistics',
            'Average',
            'Maximum',
            '--region',
            region,
            '--output',
            'json',
          ],
          { encoding: 'utf8' },
        )
        metrics.push({ instanceId, metricName, datapoints: JSON.parse(raw).Datapoints ?? [] })
      }
    }
    return { skipped: false, asgName, instanceIds, metrics }
  } catch (error) {
    return { skipped: true, error: error instanceof Error ? error.message : String(error) }
  }
}

const httpUrl = required('RELAY_PERF_HTTP_URL').replace(/\/$/, '')
const turnHost = required('RELAY_PERF_TURN_HOST')
const turnUser = process.env.RELAY_PERF_TURN_USER?.trim() || 'cardgame'
const turnPassword = required('RELAY_PERF_TURN_CREDENTIAL')
const region = required('AWS_REGION')
const asgName = process.env.RELAY_PERF_ASG_NAME?.trim()
const maxAllocations = optionalNumber('RELAY_PERF_MAX_ALLOCATIONS', 20)
const durationSeconds = optionalNumber('RELAY_PERF_DURATION_SECONDS', 60)
const pollSeconds = optionalNumber('RELAY_PERF_READY_TIMEOUT_SECONDS', 240)

const startedAt = new Date()
const startResponse = await postJson(`${httpUrl}/turn/start`, {})
let status = await getJson(`${httpUrl}/turn/status`)
const statusSamples = [{ at: new Date().toISOString(), status }]
const deadline = Date.now() + pollSeconds * 1000
while (!status.ready && Date.now() < deadline) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, 5000))
  status = await getJson(`${httpUrl}/turn/status`)
  statusSamples.push({ at: new Date().toISOString(), status })
}

const readyAt = status.ready ? new Date() : null
const allocations = []
for (const count of [1, Math.ceil(maxAllocations / 4), Math.ceil(maxAllocations / 2), maxAllocations]) {
  const uniqueCount = Math.max(1, Math.min(maxAllocations, count))
  if (allocations.some((row) => row.requestedAllocations === uniqueCount)) continue
  allocations.push({
    requestedAllocations: uniqueCount,
    result: runTurnClient({
      host: turnHost,
      user: turnUser,
      password: turnPassword,
      allocations: uniqueCount,
      durationSeconds,
    }),
  })
}

const endedAt = new Date()
const awsMetrics = collectAwsMetrics({
  region,
  asgName,
  startIso: startedAt.toISOString(),
  endIso: endedAt.toISOString(),
})

const successfulAllocations = allocations
  .filter((row) => row.result.skipped || row.result.exitCode === 0)
  .map((row) => row.requestedAllocations)
const peakSuccessfulAllocations = successfulAllocations.length ? Math.max(...successfulAllocations) : 0

const result = {
  startedAt: startedAt.toISOString(),
  endedAt: endedAt.toISOString(),
  relayHost: turnHost,
  httpUrl,
  startResponse,
  statusSamples,
  finalStatus: status,
  readySeconds: readyAt ? Math.round((readyAt.getTime() - startedAt.getTime()) / 1000) : null,
  maxAllocations,
  durationSeconds,
  peakSuccessfulAllocations,
  allocations,
  awsMetrics,
}

writeFileSync(resolve(outDir, 'relay-perf.json'), `${JSON.stringify(result, null, 2)}\n`)

const markdown = [
  '<!-- card-game-relay-perf -->',
  '### Relay performance test',
  '',
  `- Relay host: \`${turnHost}\``,
  `- Ready: ${status.ready ? 'yes' : 'no'}`,
  `- Startup time: ${result.readySeconds == null ? 'not ready before timeout' : `${result.readySeconds}s`}`,
  `- Peak attempted allocation step without tool failure: ${peakSuccessfulAllocations}`,
  `- Requested max allocations: ${maxAllocations}`,
  `- Test duration per step: ${durationSeconds}s`,
  `- ASG: ${asgName ? `\`${asgName}\`` : 'not provided'}`,
  '',
  'Raw JSON metrics are attached to the workflow run artifacts.',
]

if (allocations.some((row) => row.result.skipped)) {
  markdown.push('', 'Note: `turnutils_uclient` was unavailable, so allocation steps were recorded as skipped.')
}

writeFileSync(resolve(outDir, 'relay-perf.md'), `${markdown.join('\n')}\n`)
console.log(markdown.join('\n'))
