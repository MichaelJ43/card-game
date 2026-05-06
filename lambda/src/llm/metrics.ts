import { CloudWatchClient, MetricDatum, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch'

const client = new CloudWatchClient({})

const NAMESPACE = 'CardGame/Llm'

export type LlmMetricEventType = 'InferenceSuccess' | 'InferenceError' | 'AuthDenied' | 'CapBlocked'

interface EmitArgs {
  eventType: LlmMetricEventType
  provider: string
  gameId?: string
  latencyMs?: number
  estimatedMicroUsd?: number
  promptTokens?: number
  outputTokens?: number
}

export async function emitLlmMetric(args: EmitArgs): Promise<void> {
  const dims = [
    { Name: 'EventType', Value: args.eventType },
    { Name: 'Provider', Value: args.provider.slice(0, 64) },
  ]
  if (args.gameId) dims.push({ Name: 'GameId', Value: String(args.gameId).slice(0, 128) })

  const data: MetricDatum[] = [{ MetricName: 'EventCount', Value: 1, Unit: StandardUnit.Count, Dimensions: dims }]

  if (typeof args.latencyMs === 'number' && Number.isFinite(args.latencyMs)) {
    data.push({
      MetricName: 'LatencyMs',
      Value: Math.max(0, args.latencyMs),
      Unit: StandardUnit.Milliseconds,
      Dimensions: dims,
    })
  }
  if (typeof args.promptTokens === 'number' && args.promptTokens > 0) {
    data.push({
      MetricName: 'PromptTokens',
      Value: args.promptTokens,
      Unit: StandardUnit.Count,
      Dimensions: dims,
    })
  }
  if (typeof args.outputTokens === 'number' && args.outputTokens > 0) {
    data.push({
      MetricName: 'CompletionTokens',
      Value: args.outputTokens,
      Unit: StandardUnit.Count,
      Dimensions: dims,
    })
  }
  if (typeof args.estimatedMicroUsd === 'number' && args.estimatedMicroUsd > 0) {
    data.push({
      MetricName: 'EstimatedSpendMicroUsd',
      Value: args.estimatedMicroUsd,
      Unit: StandardUnit.None,
      Dimensions: dims,
    })
  }

  try {
    await client.send(new PutMetricDataCommand({ Namespace: NAMESPACE, MetricData: data }))
  } catch (e) {
    console.warn('PutMetricData failed', e)
  }
}
