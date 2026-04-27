import { useEffect, useId } from 'react'

export type UnoWildColor = 'r' | 'y' | 'g' | 'b'

const COLORS: { id: UnoWildColor; label: string; swatch: string }[] = [
  { id: 'r', label: 'Red', swatch: 'app__unoColorSwatch--r' },
  { id: 'y', label: 'Yellow', swatch: 'app__unoColorSwatch--y' },
  { id: 'g', label: 'Green', swatch: 'app__unoColorSwatch--g' },
  { id: 'b', label: 'Blue', swatch: 'app__unoColorSwatch--b' },
]

export interface UnoWildColorModalProps {
  open: boolean
  onClose: () => void
  onChooseColor: (color: UnoWildColor) => void
}

export function UnoWildColorModal({ open, onClose, onChooseColor }: UnoWildColorModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="app__modalBackdrop" role="presentation" onClick={onClose}>
      <div
        className="app__modal app__modal--unoWild"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="app__modalHeader">
          <h2 id={titleId} className="app__modalTitle">
            Wild — choose a color
          </h2>
          <button type="button" className="app__btnSecondary app__btnToolbar" onClick={onClose}>
            Cancel
          </button>
        </div>
        <div className="app__modalBody app__modalBody--unoWild">
          <p className="app__tableIntentHint">The next color in play will be the one you pick.</p>
          <div className="app__unoColorGrid" role="group" aria-label="Uno color choice">
            {COLORS.map(({ id, label, swatch }) => (
              <button
                key={id}
                type="button"
                className={`app__unoColorBtn ${swatch}`}
                onClick={() => onChooseColor(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
