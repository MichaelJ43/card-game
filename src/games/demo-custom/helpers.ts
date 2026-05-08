import type { GameManifestYaml } from '../../core/types'
import type { CardTemplate } from '../../core/types'

export function totalPlayers(m: GameManifestYaml): number {
  return m.players.human + m.players.ai
}

export function cardValue(templates: Record<string, CardTemplate>, templateId: string): number {
  const v = templates[templateId]?.value
  return typeof v === 'number' ? v : 0
}
