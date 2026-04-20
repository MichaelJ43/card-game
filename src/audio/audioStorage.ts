export const AUDIO_CUES_STORAGE_KEY = 'card-game:audio-cues:v1'
const STORAGE_KEY = AUDIO_CUES_STORAGE_KEY

export type AudioCueId = 'chat' | 'turn' | 'flip'

export type AudioCueVolumes = Record<AudioCueId, number>

const DEFAULTS: AudioCueVolumes = { chat: 0, turn: 0, flip: 0 }

function clampVol(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

function parseStored(raw: string | null): AudioCueVolumes {
  if (!raw) return { ...DEFAULTS }
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    return {
      chat: clampVol(Number(o.chat)),
      turn: clampVol(Number(o.turn)),
      flip: clampVol(Number(o.flip)),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

/** Read volumes from localStorage (0–100 per cue). */
export function readAudioCueVolumes(): AudioCueVolumes {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  return parseStored(window.localStorage.getItem(STORAGE_KEY))
}

/** Persist one cue volume (0–100). */
export function writeAudioCueVolume(id: AudioCueId, volume: number): void {
  if (typeof window === 'undefined') return
  const next = { ...readAudioCueVolumes(), [id]: clampVol(volume) }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

/** Toggle helper: on → 100, off → 0. */
export function setAudioCueBoolean(id: AudioCueId, enabled: boolean): void {
  writeAudioCueVolume(id, enabled ? 100 : 0)
}
