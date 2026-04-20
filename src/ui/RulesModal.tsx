import { useEffect, useId, type ReactNode } from 'react'

export interface RulesModalProps {
  open: boolean
  onClose: () => void
  markdown: string
  /** Shown above the rules text (e.g. house rule controls). */
  optionsPanel?: ReactNode
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

function RulesMarkdownBody({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const trimmed = (lines[i] ?? '').trim()
    if (!trimmed) {
      i++
      continue
    }
    if (/^##\s+/.test(trimmed)) {
      blocks.push(
        <h3 key={`h-${i}`} className="app__rulesSubhead">
          {trimmed.replace(/^##\s+/, '')}
        </h3>,
      )
      i++
      continue
    }
    const olLine = /^\d+\.\s/.test(trimmed)
    const ulLine = /^[-*]\s/.test(trimmed)
    if (olLine || ulLine) {
      const ordered = olLine
      const items: string[] = []
      while (i < lines.length) {
        const t = (lines[i] ?? '').trim()
        if (!t) break
        if (ordered && /^\d+\.\s/.test(t)) {
          items.push(t.replace(/^\d+\.\s*/, ''))
          i++
        } else if (!ordered && /^[-*]\s/.test(t)) {
          items.push(t.replace(/^[-*]\s*/, ''))
          i++
        } else break
      }
      if (ordered) {
        blocks.push(
          <ol key={`ol-${i}`} className="app__rulesOl">
            {items.map((t, j) => (
              <li key={j}>{t}</li>
            ))}
          </ol>,
        )
      } else {
        blocks.push(
          <ul key={`ul-${i}`} className="app__rulesUl">
            {items.map((t, j) => (
              <li key={j}>{t}</li>
            ))}
          </ul>,
        )
      }
      continue
    }
    const paraLines: string[] = []
    while (i < lines.length) {
      const raw = lines[i] ?? ''
      const t = raw.trim()
      if (!t) break
      if (/^##\s/.test(t) || /^\d+\.\s/.test(t) || /^[-*]\s/.test(t)) break
      paraLines.push(raw.trimEnd())
      i++
    }
    if (paraLines.length) {
      blocks.push(
        <p key={`p-${i}`} className="app__rulesParagraph">
          {paraLines.join(' ')}
        </p>,
      )
    }
  }
  return <div className="app__rulesFlow">{blocks}</div>
}

export function RulesModal({ open, onClose, markdown, optionsPanel }: RulesModalProps) {
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
        className="app__modal app__modal--rules"
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
        <div className="app__modalBody app__modalBody--rules">
          {optionsPanel}
          <RulesMarkdownBody text={body} />
        </div>
      </div>
    </div>
  )
}
