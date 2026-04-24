import { describe, expect, it } from 'vitest'
import type { CardInstance, Zone } from '../core/types'
import { shouldShowFaceForViewer } from './cardVisibility'

describe('shouldShowFaceForViewer', () => {
  it('shows intentionally revealed cards in another player hand', () => {
    const dealerHand: Zone = {
      id: 'hand:1',
      kind: 'spread',
      defaultFaceUp: true,
      ownerPlayerIndex: 1,
      cards: [],
    }
    const card: CardInstance = {
      instanceId: 'dealer-up-card',
      templateId: 'AS',
      faceUp: true,
    }

    expect(shouldShowFaceForViewer(dealerHand, card, 0, 0)).toBe(true)
  })

  it('keeps face-down cards hidden even in another player hand', () => {
    const opponentHand: Zone = {
      id: 'hand:1',
      kind: 'spread',
      defaultFaceUp: false,
      ownerPlayerIndex: 1,
      cards: [],
    }
    const card: CardInstance = {
      instanceId: 'opponent-hidden-card',
      templateId: 'KH',
      faceUp: false,
    }

    expect(shouldShowFaceForViewer(opponentHand, card, 0, 0)).toBe(false)
  })
})
