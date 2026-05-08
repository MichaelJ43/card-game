import type { GameModuleContext } from '../../core/gameModule'

export function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

export function stacksFrom(ctx: GameModuleContext, n: number): number[] {
  if (ctx.matchCumulativeScores?.length === n) return [...ctx.matchCumulativeScores]
  const v = ctx.manifest.match?.startingStack ?? 100
  return Array.from({ length: n }, () => (typeof v === 'number' && v > 0 ? v : 100))
}
