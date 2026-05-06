import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { ddb } from '../storage'

const PK = 'METRIC#LLM'
const SK_PREFIX = 'SPEND#'

function tableName(): string {
  const name = process.env.ROOMS_TABLE
  if (!name) throw new Error('ROOMS_TABLE env var is not set')
  return name
}

function utcMonthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function sk(): string {
  return `${SK_PREFIX}${utcMonthKey()}`
}

export interface SpendSnapshot {
  monthKey: string
  estimatedMicroUsd: number
}

function parseBudgetEnv(): number {
  const raw = process.env.LLM_MONTHLY_BUDGET_USD
  const n = raw ? Number(raw) : Number.NaN
  return Number.isFinite(n) ? n : Number.NaN
}

/** Budget meaning: `-1` = unlimited (still records spend). `0` = LLM disabled. `>0` = cap in USD for the UTC month (estimated). */
export function llmBudgetMode(): 'off' | 'unlimited' | 'capped' {
  const b = parseBudgetEnv()
  if (!Number.isFinite(b) || b === 0) return 'off'
  if (b < 0) return 'unlimited'
  return 'capped'
}

export function monthlyBudgetUsd(): number | null {
  const b = parseBudgetEnv()
  if (!Number.isFinite(b) || b <= 0) return null
  return b
}

export async function getMonthlySpendUsd(): Promise<SpendSnapshot> {
  const res = await ddb.send(
    new GetCommand({ TableName: tableName(), Key: { pk: PK, sk: sk() }, ConsistentRead: true }),
  )
  const item = res.Item as { estimatedMicroUsd?: number } | undefined
  const micro = typeof item?.estimatedMicroUsd === 'number' ? item.estimatedMicroUsd : 0
  return {
    monthKey: sk().replace(SK_PREFIX, ''),
    estimatedMicroUsd: micro,
  }
}

/**
 * Throws if capped mode and projected spend >= cap (estimated in micro-USD integers).
 */
export async function ensureUnderBudget(projectedSpendMicroUsd: number): Promise<SpendSnapshot> {
  const mode = llmBudgetMode()
  const snap = await getMonthlySpendUsd()
  if (mode === 'off') throw new Error('LLM is disabled.')
  if (mode === 'unlimited') return snap
  const capUsd = monthlyBudgetUsd()
  if (capUsd == null) throw new Error('Budget misconfigured.')

  const capMicro = Math.floor(capUsd * 1e6)
  if (snap.estimatedMicroUsd + projectedSpendMicroUsd > capMicro) {
    const err = new Error('Monthly LLM spend cap exceeded.')
    ;(err as { code?: string }).code = 'LLM_CAP_EXCEEDED'
    throw err
  }
  return snap
}

/** Record estimated spend atomically after a successful inference. */
export async function incrementMonthlySpend(deltaMicroUsd: number): Promise<void> {
  if (deltaMicroUsd <= 0) return
  const mode = llmBudgetMode()
  if (mode === 'off') return
  await ddb.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: { pk: PK, sk: sk() },
      UpdateExpression: 'ADD estimatedMicroUsd :d SET updatedAt = :t',
      ExpressionAttributeValues: {
        ':d': Math.ceil(deltaMicroUsd),
        ':t': Date.now(),
      },
    }),
  )
}
