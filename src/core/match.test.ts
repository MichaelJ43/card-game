import { describe, it, expect } from 'vitest'
import type { GameManifestYaml } from './types'
import { applyFinishedRound, createInitialMatchState } from './match'

function mkManifest(overrides: Partial<GameManifestYaml> = {}): GameManifestYaml {
  return {
    id: 'test',
    name: 'Test',
    module: 'test',
    deck: 'standard-52',
    players: { human: 1, ai: 1 },
    match: {
      enabled: true,
      targetScore: 100,
      winnerIs: 'lowest',
      endCondition: 'anyAtOrAbove',
    },
    ...overrides,
  } as GameManifestYaml
}

describe('createInitialMatchState', () => {
  it('returns undefined when match is not enabled', () => {
    const m = mkManifest({ match: { enabled: false, targetScore: 0, winnerIs: 'lowest', endCondition: 'anyAtOrAbove' } })
    expect(createInitialMatchState(m)).toBeUndefined()
  })

  it('starts with zeros when no startingStack', () => {
    const s = createInitialMatchState(mkManifest())!
    expect(s.round).toBe(1)
    expect(s.cumulativeScores).toEqual([0, 0])
    expect(s.complete).toBe(false)
    expect(s.matchWinnerIndex).toBeNull()
  })

  it('uses startingStack for chip-style matches', () => {
    const m = mkManifest({
      match: {
        enabled: true,
        targetScore: 200,
        winnerIs: 'highest',
        endCondition: 'anyAtOrAbove',
        startingStack: 100,
      },
    })
    const s = createInitialMatchState(m)!
    expect(s.cumulativeScores).toEqual([100, 100])
  })
})

describe('applyFinishedRound', () => {
  it('accumulates scores and advances round when under threshold (lowest)', () => {
    const init = createInitialMatchState(mkManifest())!
    const next = applyFinishedRound(init, [5, 10])
    expect(next.cumulativeScores).toEqual([5, 10])
    expect(next.round).toBe(2)
    expect(next.complete).toBe(false)
    expect(next.completedRoundScores).toEqual([[5, 10]])
  })

  it('ends match when someone reaches threshold and picks lowest', () => {
    const init = createInitialMatchState(mkManifest())!
    const step1 = applyFinishedRound(init, [30, 50])
    const step2 = applyFinishedRound(step1, [40, 55])
    expect(step2.cumulativeScores).toEqual([70, 105])
    expect(step2.complete).toBe(true)
    expect(step2.matchWinnerIndex).toBe(0)
  })

  it('picks highest when winnerIs highest', () => {
    const init = createInitialMatchState(mkManifest({
      match: { enabled: true, targetScore: 100, winnerIs: 'highest', endCondition: 'anyAtOrAbove' },
    }))!
    const step = applyFinishedRound(init, [120, 50])
    expect(step.complete).toBe(true)
    expect(step.matchWinnerIndex).toBe(0)
  })
})
