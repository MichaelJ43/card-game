/** How the last move for a seat was chosen (for LLM pattern context). */
export type MoveActorPolicy = 'human' | 'heuristic' | 'llm'

export interface MoveLedgerEntry {
  /** Monotonic index within this deal (0-based). */
  seq: number
  seat: number
  policy: MoveActorPolicy
  /** Short action summary for the model (not a full wire dump). */
  summary: string
}

const MAX_LEDGER = 48

export function appendMoveLedger(
  prev: MoveLedgerEntry[] | undefined,
  entry: Omit<MoveLedgerEntry, 'seq'>,
  seq: number,
): MoveLedgerEntry[] {
  const next = [...(prev ?? []), { ...entry, seq }]
  return next.length > MAX_LEDGER ? next.slice(-MAX_LEDGER) : next
}

export function nextLedgerSeq(prev: MoveLedgerEntry[] | undefined): number {
  const n = prev?.length ?? 0
  return n === 0 ? 0 : (prev![n - 1]!.seq + 1)
}

export function defaultActionSummary(action: unknown): string {
  try {
    if (!action || typeof action !== 'object') return String(action).slice(0, 200)
    const a = action as Record<string, unknown>
    const t = a.type
    if (typeof t !== 'string') return JSON.stringify(action).slice(0, 200)
    const payload = a.payload
    if (payload && typeof payload === 'object') {
      return `${t}:${JSON.stringify(payload).slice(0, 120)}`
    }
    const keys = Object.keys(a).filter((k) => k !== 'type')
    const rest: Record<string, unknown> = {}
    for (const k of keys.slice(0, 6)) rest[k] = a[k]
    return `${t}:${JSON.stringify(rest).slice(0, 160)}`
  } catch {
    return '(action)'
  }
}
