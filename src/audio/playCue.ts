import type { AudioCueId } from './audioStorage'

function cueUrl(id: AudioCueId): string {
  const base = import.meta.env.BASE_URL || '/'
  const p = base.endsWith('/') ? `${base}sounds/${id}.wav` : `${base}/sounds/${id}.wav`
  return new URL(p, window.location.origin).href
}

const cache = new Map<AudioCueId, HTMLAudioElement>()

function getAudio(id: AudioCueId): HTMLAudioElement {
  let a = cache.get(id)
  if (!a) {
    a = new Audio(cueUrl(id))
    cache.set(id, a)
  }
  return a
}

/**
 * Play a bundled cue at volume 0–100. No-op at 0.
 * Uses HTMLAudioElement (decode once). Overlapping plays restart the same node.
 */
export function playAudioCue(id: AudioCueId, volumePercent: number): void {
  if (volumePercent <= 0) return
  const a = getAudio(id)
  a.volume = Math.max(0, Math.min(1, volumePercent / 100))
  a.currentTime = 0
  void a.play().catch(() => {
    // Autoplay policy or missing file — ignore
  })
}
