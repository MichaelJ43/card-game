import type { CardInstance, CardTemplate } from '../core/types'
import './CardView.css'

const SUIT_SYMBOL: Record<string, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
}

function isRedSuit(suit: string | undefined): boolean {
  return suit === 'hearts' || suit === 'diamonds'
}

export interface CardViewProps {
  card: CardInstance
  template: CardTemplate | undefined
  /** When false, show card back (hidden) */
  showFace: boolean
}

function skyjoTierClass(value: number): string {
  if (value <= -1) return 'card--skyjoBlue'
  if (value === 0) return 'card--skyjoAqua'
  if (value <= 4) return 'card--skyjoGreen'
  if (value <= 8) return 'card--skyjoYellow'
  return 'card--skyjoRed'
}

export function CardView({ card, template, showFace }: CardViewProps) {
  if (template?.id === '__slot__') {
    return <div className="card card--skyjoSlot" aria-hidden="true" />
  }

  if (!showFace || !card.faceUp) {
    return (
      <div className="card card--back" aria-label="Hidden card">
        <div className="card__backPattern" />
      </div>
    )
  }

  if (template?.skyjo === true && typeof template.value === 'number') {
    const v = template.value
    return (
      <div
        className={`card card--skyjo ${skyjoTierClass(v)}`}
        aria-label={`Skyjo ${v}`}
      >
        <span className="card__skyjoValue">{v}</span>
      </div>
    )
  }

  const rank = template?.rank
  const suit = template?.suit
  const label = template?.label
  const color = typeof template?.color === 'string' ? template.color : undefined

  if (label !== undefined || !suit) {
    return (
      <div
        className="card card--custom"
        style={color ? { color, borderColor: color } : undefined}
        aria-label={template?.id}
      >
        <span className="card__customLabel">{String(label ?? template?.id ?? '?')}</span>
        {template?.value !== undefined && (
          <span className="card__customValue">{template.value}</span>
        )}
      </div>
    )
  }

  const sym = typeof suit === 'string' ? SUIT_SYMBOL[suit] ?? suit : ''
  const red = isRedSuit(typeof suit === 'string' ? suit : undefined)

  return (
    <div
      className={`card card--standard${red ? ' card--red' : ''}`}
      aria-label={`${String(rank)} ${String(suit)}`}
    >
      <span className="card__rank">{String(rank)}</span>
      <span className="card__suit">{sym}</span>
    </div>
  )
}
