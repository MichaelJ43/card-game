import { describe, it, expect } from 'vitest'
import type { GameManifestYaml } from '../core/types'
import {
  clampAiOpponentCount,
  clampRemoteHumanCount,
  configurableAiOpponentLimits,
  gameSupportsOnlineMultiplayer,
  manifestWithPlayerCounts,
  MAX_AI_OPPONENTS,
  MAX_REMOTE_HUMANS,
} from './playerConfig'

function mkManifest(human = 1, ai = 1, id = 'go-fish', module_ = id): GameManifestYaml {
  return {
    id,
    name: id,
    module: module_,
    deck: 'standard-52',
    players: { human, ai },
  } as GameManifestYaml
}

describe('clampAiOpponentCount', () => {
  it('caps heads-up games at 1 AI', () => {
    expect(clampAiOpponentCount('blackjack', 5)).toBe(1)
  })

  it('allows 0..MAX for multi-seat configurable games', () => {
    expect(clampAiOpponentCount('go-fish', 0)).toBe(0)
    expect(clampAiOpponentCount('go-fish', -3)).toBe(0)
    expect(clampAiOpponentCount('go-fish', 100)).toBe(MAX_AI_OPPONENTS)
  })

  it('forces at least 1 AI for heads-up configurable titles', () => {
    expect(clampAiOpponentCount('poker-draw', 0)).toBe(1)
    expect(clampAiOpponentCount('poker-draw', 2)).toBe(1)
  })
})

describe('configurableAiOpponentLimits', () => {
  it('exposes 0..MAX for go-fish', () => {
    expect(configurableAiOpponentLimits('go-fish')).toEqual({ min: 0, max: MAX_AI_OPPONENTS })
  })

  it('exposes 1..1 for poker-draw', () => {
    expect(configurableAiOpponentLimits('poker-draw')).toEqual({ min: 1, max: 1 })
  })
})

describe('gameSupportsOnlineMultiplayer', () => {
  it('includes casual family games', () => {
    expect(gameSupportsOnlineMultiplayer('go-fish')).toBe(true)
    expect(gameSupportsOnlineMultiplayer('uno')).toBe(true)
  })

  it('excludes heads-up-only titles', () => {
    expect(gameSupportsOnlineMultiplayer('blackjack')).toBe(false)
    expect(gameSupportsOnlineMultiplayer('baccarat')).toBe(false)
  })
})

describe('clampRemoteHumanCount', () => {
  it('is zero for unsupported games', () => {
    expect(clampRemoteHumanCount('blackjack', 3)).toBe(0)
  })

  it('clamps to [0, MAX_REMOTE_HUMANS]', () => {
    expect(clampRemoteHumanCount('go-fish', -2)).toBe(0)
    expect(clampRemoteHumanCount('go-fish', 99)).toBe(MAX_REMOTE_HUMANS)
  })
})

describe('manifestWithPlayerCounts', () => {
  it('returns original manifest when no counts provided', () => {
    const m = mkManifest(1, 3)
    expect(manifestWithPlayerCounts(m, 'go-fish', {})).toBe(m)
  })

  it('applies AI count for configurable games', () => {
    const m = mkManifest(1, 3)
    const out = manifestWithPlayerCounts(m, 'go-fish', { aiCount: 2 })
    expect(out.players).toEqual({ human: 1, ai: 2 })
  })

  it('adds remote humans on top of local host', () => {
    const m = mkManifest(1, 3)
    const out = manifestWithPlayerCounts(m, 'go-fish', { remoteHumanCount: 2 })
    expect(out.players.human).toBe(3)
    expect(out.players.ai).toBe(3)
  })

  it('combines remote humans + AI count', () => {
    const m = mkManifest(1, 5)
    const out = manifestWithPlayerCounts(m, 'go-fish', { remoteHumanCount: 2, aiCount: 1 })
    expect(out.players).toEqual({ human: 3, ai: 1 })
  })

  it('ignores remote humans for unsupported games', () => {
    const m = mkManifest(1, 1)
    const out = manifestWithPlayerCounts(m, 'blackjack', { remoteHumanCount: 3 })
    expect(out.players.human).toBe(1)
  })
})
