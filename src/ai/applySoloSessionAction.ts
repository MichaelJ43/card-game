import type { GameAction } from '../core/types'
import type { GameSession } from '../session'
import {
  appendMoveLedger,
  defaultActionSummary,
  nextLedgerSeq,
  type MoveActorPolicy,
} from '../session/moveLedger'

export interface ApplySoloActionOpts {
  actorSeat: number
  policy: MoveActorPolicy
}

/** Apply a validated action and append the move ledger (solo / host full-state only). */
export function tryApplySoloSessionAction(
  session: GameSession,
  action: GameAction,
  opts: ApplySoloActionOpts,
): { ok: true; session: GameSession } | { ok: false; error: string } {
  const r = session.module.applyAction(session.table, session.gameState, action)
  if (r.error) return { ok: false, error: r.error }
  const summary =
    session.module.summarizeLedgerAction?.(action) ?? defaultActionSummary(action)
  const seq = nextLedgerSeq(session.moveLedger)
  const moveLedger = appendMoveLedger(session.moveLedger, {
    seat: opts.actorSeat,
    policy: opts.policy,
    summary,
  }, seq)
  return {
    ok: true,
    session: {
      ...session,
      table: r.table,
      gameState: r.gameState,
      moveLedger,
    },
  }
}
