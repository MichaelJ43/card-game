import { useEffect, useId } from 'react'

export interface RulesModalProps {
  open: boolean
  onClose: () => void
  markdown: string
}

/** Split leading `# Title` from body for dialog chrome. */
function parseRulesHeading(markdown: string): { title: string; body: string } {
  const trimmed = markdown.trim()
  const lines = trimmed.split('\n')
  const first = lines[0] ?? ''
  const m = /^#\s+(.+)$/.exec(first)
  if (!m) {
    return { title: 'Rules', body: trimmed }
  }
  const body = lines.slice(1).join('\n').trim()
  return { title: m[1]!.trim(), body }
}

export function RulesModal({ open, onClose, markdown }: RulesModalProps) {
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

  const { title, body } = parseRulesHeading(markdown)

  return (
    <div className="app__modalBackdrop" role="presentation" onClick={onClose}>
      <div
        className="app__modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="app__modalHeader">
          <h2 id={titleId} className="app__modalTitle">
            {title}
          </h2>
          <button type="button" className="app__btnSecondary app__btnToolbar" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="app__modalBody">
          <div className="app__rulesMarkdown">
            {body
              .split(/\n\n+/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((para, i) => (
                <p key={i} className="app__rulesParagraph">
                  {para}
                </p>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
