import type { GameModuleContext } from '../../core/gameModule'
import type { CardTemplate, GameManifestYaml } from '../../core/types'
import { rankOrder } from '../standard/cardUtils'

export function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

export function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

export function stacksFrom(ctx: GameModuleContext, n: number): number[] {
  if (ctx.matchCumulativeScores?.length === n) return [...ctx.matchCumulativeScores]
  const v = ctx.manifest.match?.startingStack ?? 100
  return Array.from({ length: n }, () => (typeof v === 'number' && v > 0 ? v : 100))
}

export function handRank(templates: Record<string, CardTemplate>, ids: string[]): number[] {
  return ids.map((id) => rankOrder(templates, id)).sort((a, b) => b - a)
}

export function compare5(templates: Record<string, CardTemplate>, a: string[], b: string[]): number {
  const ha = handRank(templates, a)
  const hb = handRank(templates, b)
  for (let i = 0; i < 5; i++) {
    if (ha[i] !== hb[i]) return ha[i]! - hb[i]!
  }
  return 0
}
