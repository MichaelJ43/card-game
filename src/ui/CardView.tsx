import { useEffect, useState } from 'react'
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
  /**
   * When true, hide this subtree from assistive tech (parent supplies the name, e.g. grid card button).
   */
  presentationOnly?: boolean
}

function skyjoTierClass(value: number): string {
  if (value <= -1) return 'card--skyjoBlue'
  if (value === 0) return 'card--skyjoAqua'
  if (value <= 4) return 'card--skyjoGreen'
  if (value <= 8) return 'card--skyjoYellow'
  return 'card--skyjoRed'
}

function CardBackShell() {
  return (
    <div className="card card--back">
      <div className="card__backPattern" />
    </div>
  )
}

function cardFaceAriaLabel(template: CardTemplate | undefined, card: CardInstance, showFace: boolean): string {
  if (!showFace || !card.faceUp) return 'Hidden card'
  if (template?.skyjo === true && typeof template.value === 'number') return `Skyjo ${template.value}`
  const rank = template?.rank
  const suit = template?.suit
  const label = template?.label
  if (label !== undefined || !suit) return String(label ?? template?.id ?? 'Card')
  return `${String(rank)} ${String(suit)}`
}

function CardFaceFront({ template }: { template: CardTemplate | undefined }) {
  if (template?.skyjo === true && typeof template.value === 'number') {
    const v = template.value
    return (
      <div className={`card card--skyjo ${skyjoTierClass(v)}`}>
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
      >
        <span className="card__customLabel">{String(label ?? template?.id ?? '?')}</span>
        {template?.value !== undefined && <span className="card__customValue">{template.value}</span>}
      </div>
    )
  }

  const sym = typeof suit === 'string' ? SUIT_SYMBOL[suit] ?? suit : ''
  const red = isRedSuit(typeof suit === 'string' ? suit : undefined)

  return (
    <div className={`card card--standard${red ? ' card--red' : ''}`}>
      <span className="card__rank">{String(rank)}</span>
      <span className="card__suit">{sym}</span>
    </div>
  )
}

export function CardView({ card, template, showFace, presentationOnly }: CardViewProps) {
  const [motionReady, setMotionReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setMotionReady(true)
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [])

  if (template?.id === '__slot__') {
    return <div className="card card--skyjoSlot" aria-hidden="true" />
  }

  const faceVisible = showFace && card.faceUp
  const label = cardFaceAriaLabel(template, card, showFace)

  return (
    <div
      className={`cardFlip${motionReady ? ' cardFlip--ready' : ''}`}
      aria-hidden={presentationOnly ? true : undefined}
      aria-label={presentationOnly ? undefined : label}
    >
      <div className={`cardFlip__inner${faceVisible ? ' cardFlip__inner--front' : ''}`}>
        <div className="cardFlip__face cardFlip__face--back">
          <CardBackShell />
        </div>
        <div className="cardFlip__face cardFlip__face--front">
          <CardFaceFront template={template} />
        </div>
      </div>
    </div>
  )
}
