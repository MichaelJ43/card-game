import { aiPlayerMenuLabel } from '../core/playerLabels'
import type { GameManifestYaml } from '../core/types'

export interface SeatProfile {
  seat: number
  id: string
  displayName: string
}

function randomSeatId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `seat-${Math.random().toString(36).slice(2, 12)}`
}

/** One profile per server seat index for the current deal (`0 … human+ai-1`). */
export function buildDefaultSeatProfiles(manifest: GameManifestYaml): SeatProfile[] {
  const { human, ai } = manifest.players
  const total = human + ai
  const out: SeatProfile[] = []
  for (let seat = 0; seat < total; seat++) {
    const id = randomSeatId()
    let displayName: string
    if (seat === 0) displayName = 'Host'
    else if (seat < human) displayName = `Player ${seat + 1}`
    else displayName = aiPlayerMenuLabel(seat - human)
    out.push({ seat, id, displayName })
  }
  return out
}
