import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUDIO_CUES_STORAGE_KEY, readAudioCueVolumes, writeAudioCueVolume } from './audioStorage'

describe('audioStorage', () => {
  const store: Record<string, string> = {}

  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v
        },
        removeItem: (k: string) => {
          delete store[k]
        },
      } as Storage,
    } as Window & typeof globalThis)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults each cue to 0', () => {
    const v = readAudioCueVolumes()
    expect(v.chat).toBe(0)
    expect(v.turn).toBe(0)
    expect(v.flip).toBe(0)
  })

  it('clamps volume to 0–100', () => {
    writeAudioCueVolume('flip', 100)
    expect(readAudioCueVolumes().flip).toBe(100)
    writeAudioCueVolume('flip', 150)
    expect(readAudioCueVolumes().flip).toBe(100)
    writeAudioCueVolume('flip', -5)
    expect(readAudioCueVolumes().flip).toBe(0)
    expect(JSON.parse(store[AUDIO_CUES_STORAGE_KEY]!)).toMatchObject({ flip: 0 })
  })
})
