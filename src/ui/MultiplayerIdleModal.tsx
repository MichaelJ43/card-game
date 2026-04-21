import { useEffect, useId, useRef } from 'react'

export interface MultiplayerIdleModalProps {
  open: boolean
  /** Seconds remaining in the countdown (e.g. 300 down to 0). */
  secondsRemaining: number
  onDismiss: () => void
}

/**
 * Full-screen dimmed overlay: inactivity countdown, Dismiss, backdrop closes.
 * Matches shell dialog styling (see docs/ui-design.md).
 */
export function MultiplayerIdleModal({ open, secondsRemaining, onDismiss }: MultiplayerIdleModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onDismiss])

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
  }, [open])

  if (!open) return null

  const m = Math.floor(secondsRemaining / 60)
  const s = secondsRemaining % 60
  const label = `${m}:${s.toString().padStart(2, '0')}`

  return (
    <div
      className="multiplayerIdleModal__backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss()
      }}
    >
      <div
        ref={panelRef}
        className="multiplayerIdleModal__dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="multiplayerIdleModal__title">
          Still here?
        </h2>
        <p className="multiplayerIdleModal__body">
          No activity for a while. This online session will end in <strong>{label}</strong> unless you continue playing
          or dismiss this message.
        </p>
        <div className="multiplayerIdleModal__actions">
          <button type="button" className="app__btnSecondary app__btnToolbar" onClick={() => onDismiss()}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
