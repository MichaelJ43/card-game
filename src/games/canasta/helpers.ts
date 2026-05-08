import type { CardTemplate, GameManifestYaml } from '../../core/types'

export function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

export function handId(i: number): string {
  return `hand:${i}`
}

export function cmd(p: Record<string, unknown> | undefined): string {
  return typeof p?.cmd === 'string' ? p.cmd : ''
}

export function isJokerTemplate(id: string): boolean {
  return id.startsWith('joker')
}

export function canastaCardWeight(tid: string, templates: Record<string, CardTemplate>): number {
  if (isJokerTemplate(tid)) return 30
  const r = templates[tid]?.rank
  if (r === 'A') return 20
  if (r === 'K' || r === 'Q' || r === 'J' || r === '10') return 10
  if (r === '9' || r === '8' || r === '7' || r === '6' || r === '5' || r === '4' || r === '3' || r === '2') {
    return 5
  }
  return 4
}
