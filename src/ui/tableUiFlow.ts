/**
 * Shell-side multi-step UI flows: the game engine stays single-action; the table shell can
 * collect several clicks before dispatching one {@link import('../core/types').GameAction}.
 *
 * Games opt in from the shell (e.g. App) by storing a small step enum and interpreting
 * {@link import('./tableIntent').TableIntent}s differently per step.
 */

/** Skyjo: optional 2-step “dump & flip” — click discard pile, then a face-down grid card. */
export type SkyjoDumpUiStep = 'idle' | 'selectFlip'

export function skyjoDumpUiStepShouldReset(gs: {
  pendingDraw: unknown | null
  pendingFromDiscard: boolean
}): boolean {
  return gs.pendingDraw == null || gs.pendingFromDiscard === true
}
