/** Next delay before another poll while TURN EC2 is stopped (capped at 24h). */
export function backoffDelayMs(stage: number): number {
  return Math.min(15 * 60 * 1000 * 2 ** stage, 24 * 60 * 60 * 1000)
}
