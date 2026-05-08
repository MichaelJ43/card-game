import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  clearMultiplayerSession,
  clearSoloSession,
  readAiPrefs,
  readMultiplayerSession,
  readSelectedGameId,
  readSoloSession,
  RESUME_MAX_AGE_MS,
  writeAiPrefs,
  writeSelectedGameId,
  writeSoloSession,
} from './sessionPersistence'

const mem: Record<string, string> = {}

describe('sessionPersistence', () => {
  beforeEach(() => {
    for (const k of Object.keys(mem)) delete mem[k]
    const stub = {
      getItem: (k: string) => (k in mem ? mem[k]! : null),
      setItem: (k: string, v: string) => {
        mem[k] = v
      },
      removeItem: (k: string) => {
        delete mem[k]
      },
      clear: () => {
        for (const k of Object.keys(mem)) delete mem[k]
      },
      key: () => null,
      get length() {
        return Object.keys(mem).length
      },
    } as Storage
    vi.stubGlobal('localStorage', stub)
    vi.stubGlobal('window', { localStorage: stub } as unknown as Window)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips selected game id', () => {
    writeSelectedGameId('skyjo')
    expect(readSelectedGameId()).toBe('skyjo')
  })

  it('rejects unknown game id', () => {
    localStorage.setItem('card-game:selected-game:v1', JSON.stringify({ id: 'not-a-game' }))
    expect(readSelectedGameId()).toBeNull()
  })

  it('round-trips AI prefs per game', () => {
    writeAiPrefs('go-fish', { aiCount: 2, aiDifficulties: ['easy', 'hard'] })
    expect(readAiPrefs('go-fish')).toEqual({ aiCount: 2, aiDifficulties: ['easy', 'hard'] })
  })

  it('drops expired solo session', () => {
    const stale = Date.now() - RESUME_MAX_AGE_MS - 1000
    localStorage.setItem(
      'card-game:solo-session:v1',
      JSON.stringify({
        v: 1,
        ts: stale,
        wire: { gameId: 'blackjack', table: { zones: {}, zoneOrder: [], templates: {} }, gameState: {} },
      }),
    )
    expect(readSoloSession()).toBeNull()
  })

  it('clears solo and multiplayer', () => {
    writeSoloSession({
      gameId: 'blackjack',
      table: { zones: {}, zoneOrder: [], templates: {} },
      gameState: {},
    })
    localStorage.setItem(
      'card-game:multiplayer-session:v1',
      JSON.stringify({
        v: 1,
        ts: Date.now(),
        role: 'client',
        gameId: 'skyjo',
        roomCode: 'ABC234',
        wsUrl: 'wss://x',
        hostPeerId: 'h-1',
        clientPeerId: 'c-1',
        token: 't',
        lastWire: null,
      }),
    )
    clearSoloSession()
    expect(readSoloSession()).toBeNull()
    clearMultiplayerSession()
    expect(readMultiplayerSession()).toBeNull()
  })
})
