import { recycleDiscardIntoDrawWhenEmpty } from '../../core/discardRecycle'
import type { CardInstance, CardTemplate, GameManifestYaml } from '../../core/types'
import type { TableState } from '../../core/types'
import type { UnoColor } from './types'

export function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

export function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

export function handId(i: number): string {
  return `hand:${i}`
}

export function tpl(templates: Record<string, CardTemplate>, id: string): CardTemplate | undefined {
  return templates[id]
}

export function uc(t: CardTemplate | undefined): string {
  return typeof t?.uc === 'string' ? t.uc : ''
}

export function uface(t: CardTemplate | undefined): string {
  return typeof t?.uf === 'string' ? t.uf : ''
}

export function topDiscard(table: TableState): CardInstance | null {
  const d = table.zones.discard?.cards
  if (!d?.length) return null
  return d[d.length - 1]!
}

export function canPlay(playTpl: CardTemplate, topTpl: CardTemplate, currentColor: UnoColor): boolean {
  const p = uc(playTpl)
  if (p === 'w') return true
  const tc = uc(topTpl)
  if (tc === 'w') {
    return p === currentColor || p === 'w'
  }
  if (p === currentColor) return true
  if (uface(playTpl) === uface(topTpl)) return true
  return false
}

export function isNumberFace(f: string): boolean {
  return f.length === 1 && f >= '0' && f <= '9'
}

export function starterOk(t: CardTemplate | undefined): boolean {
  if (!t) return false
  return isNumberFace(uface(t))
}

export function step(cur: number, direction: number, n: number): number {
  return (cur + direction + n * 100) % n
}

export function ensureDraw(table: TableState, rng: () => number, reshuffleEnabled: boolean): void {
  recycleDiscardIntoDrawWhenEmpty(table, rng, { enabled: reshuffleEnabled, preserveTopDiscard: true })
}

export function handValue(templates: Record<string, CardTemplate>, cards: CardInstance[]): number {
  let s = 0
  for (const c of cards) {
    const t = tpl(templates, c.templateId)
    if (!t) continue
    if (uc(t) === 'w') {
      s += 50
    } else {
      const f = uface(t)
      if (f === 'sk' || f === 'rev' || f === 'd2') s += 20
      else if (isNumberFace(f)) s += Number(f)
    }
  }
  return s
}

export function roundOverScores(
  templates: Record<string, CardTemplate>,
  table: TableState,
  pCount: number,
  winner: number,
): number[] {
  const scores = Array.from({ length: pCount }, () => 0)
  let total = 0
  for (let p = 0; p < pCount; p++) {
    if (p === winner) continue
    total += handValue(templates, table.zones[handId(p)]!.cards)
  }
  scores[winner] = total
  return scores
}
