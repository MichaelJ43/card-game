import { describe, expect, it } from 'vitest'
import type { GameManifestYaml } from '../core/types'
import { buildDefaultSeatProfiles } from './seatProfiles'

describe('buildDefaultSeatProfiles', () => {
  it('assigns Host, human slots, then AI labels', () => {
    const m: GameManifestYaml = {
      id: 'skyjo',
      name: 'Skyjo',
      module: 'skyjo',
      deck: 'skyjo',
      players: { human: 2, ai: 1 },
    }
    const p = buildDefaultSeatProfiles(m)
    expect(p).toHaveLength(3)
    expect(p[0]).toMatchObject({ seat: 0, displayName: 'Host' })
    expect(p[1]).toMatchObject({ seat: 1, displayName: 'Player 2' })
    expect(p[2]).toMatchObject({ seat: 2, displayName: 'AI Player 1' })
    expect(p[0]!.id).toBeTruthy()
    expect(p[0]!.id).not.toBe(p[1]!.id)
  })
})
