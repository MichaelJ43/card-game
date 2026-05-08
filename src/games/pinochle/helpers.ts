import type { CardInstance, CardTemplate, GameManifestYaml } from '../../core/types'

export const RANK_ORDER = ['9', '10', 'J', 'Q', 'K', 'A'] as const

export function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

export function handId(i: number): string {
  return `hand:${i}`
}

export function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

export function rankIdx(rank: string | undefined): number {
  if (!rank) return -1
  return RANK_ORDER.indexOf(rank as (typeof RANK_ORDER)[number])
}

export function trickPower(
  templates: Record<string, CardTemplate>,
  templateId: string,
  trump: string,
  leadSuit: string,
): number {
  const t = templates[templateId]
  const suit = typeof t?.suit === 'string' ? t.suit : ''
  const r = typeof t?.rank === 'string' ? t.rank : ''
  const ri = rankIdx(r)
  const isTrump = suit === trump
  const followsLead = suit === leadSuit
  if (isTrump) return 200 + ri
  if (followsLead) return 100 + ri
  return ri
}

export function resolveTrick(
  templates: Record<string, CardTemplate>,
  trick: { player: number; templateId: string }[],
  trump: string,
): number {
  const leadSuit = templates[trick[0]!.templateId]?.suit
  const ls = typeof leadSuit === 'string' ? leadSuit : ''
  let best = -1
  let bestP = trick[0]!.player
  for (const pl of trick) {
    const p = trickPower(templates, pl.templateId, trump, ls)
    if (p > best) {
      best = p
      bestP = pl.player
    }
  }
  return bestP
}

export function hasSuit(hand: CardInstance[], templates: Record<string, CardTemplate>, suit: string): boolean {
  return hand.some((c) => templates[c.templateId]?.suit === suit)
}

export function legalPlays(
  templates: Record<string, CardTemplate>,
  hand: CardInstance[],
  trick: { player: number; templateId: string }[],
): number[] {
  if (trick.length === 0) {
    return hand.map((_, i) => i)
  }
  const leadT = templates[trick[0]!.templateId]
  const leadSuit = typeof leadT?.suit === 'string' ? leadT.suit : ''
  const mustFollow = hasSuit(hand, templates, leadSuit)
  const out: number[] = []
  hand.forEach((c, i) => {
    const s = templates[c.templateId]?.suit
    if (!mustFollow || s === leadSuit) out.push(i)
  })
  return out
}
