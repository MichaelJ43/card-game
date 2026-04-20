import { useCallback, useEffect, useState } from 'react'
import {
  AUDIO_CUES_STORAGE_KEY,
  readAudioCueVolumes,
  setAudioCueBoolean,
  type AudioCueId,
  type AudioCueVolumes,
} from '../audio/audioStorage'
import { playAudioCue } from '../audio/playCue'

export function AudioCueBar({ inRoom }: { inRoom: boolean }) {
  const [volumes, setVolumes] = useState<AudioCueVolumes>(() => readAudioCueVolumes())

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUDIO_CUES_STORAGE_KEY) setVolumes(readAudioCueVolumes())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback((id: AudioCueId) => {
    const cur = readAudioCueVolumes()[id]
    const nextOn = cur <= 0
    setAudioCueBoolean(id, nextOn)
    setVolumes(readAudioCueVolumes())
    if (nextOn) playAudioCue(id, 100)
  }, [])

  const btn = (id: AudioCueId, label: string, title: string, visible: boolean) => {
    if (!visible) return null
    const on = volumes[id] > 0
    return (
      <button
        key={id}
        type="button"
        className={`app__audioCue app__btnSecondary app__btnToolbar${on ? ' app__audioCue--on' : ''}`}
        aria-pressed={on}
        title={title}
        onClick={() => toggle(id)}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="app__audioCues" role="group" aria-label="Sound cues (volume 0 or 100 for now)">
      {btn(
        'chat',
        'Chat sound',
        'Play when a room chat line arrives as a toast (chat window closed). Stored as 0–100; button is on=100, off=0.',
        inRoom,
      )}
      {btn(
        'turn',
        'Turn sound',
        'Play when the current player changes while this tab is not focused or is in the background. On=100, off=0.',
        true,
      )}
      {btn('flip', 'Card sound', 'Play when cards on the table move or flip. On=100, off=0.', true)}
    </div>
  )
}
