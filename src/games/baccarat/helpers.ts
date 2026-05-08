import type { GameModuleContext } from '../../core/gameModule'
import type { CardTemplate } from '../../core/types'

export function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

export function baccaratValue(templates: Record<string, CardTemplate>, ids: string[]): number {
  let s = 0
  for (const id of ids) {
    const r = templates[id]?.rank
    if (r === 'A') s += 1
    else if (r === '10' || r === 'J' || r === 'Q' || r === 'K') s += 0
    else if (r === '2' || r === '3' || r === '4' || r === '5' || r === '6' || r === '7' || r === '8' || r === '9') {
      s += Number(r)
    }
  }
  return s % 10
}

export function startingStacks(ctx: GameModuleContext, n: number): number[] {
  if (ctx.matchCumulativeScores && ctx.matchCumulativeScores.length === n) return [...ctx.matchCumulativeScores]
  const v = ctx.manifest.match?.startingStack ?? 100
  return Array.from({ length: n }, () => (typeof v === 'number' && v > 0 ? v : 100))
}
