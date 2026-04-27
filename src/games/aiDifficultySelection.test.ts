import { describe, expect, it } from 'vitest'
import { getGameModule } from '../core/registry'
import type { CardInstance, CardTemplate, TableState, Zone } from '../core/types'
import './crazy-eights'
import './euchre'

function card(instanceId: string, templateId: string): CardInstance {
  return { instanceId, templateId, faceUp: true }
}

function zone(id: string, cards: CardInstance[], ownerPlayerIndex?: number): Zone {
  return { id, kind: 'spread', defaultFaceUp: true, ownerPlayerIndex, cards }
}

describe('difficulty-aware AI selection', () => {
  it('crazy eights hard saves an 8 when a normal card is playable', () => {
    const mod = getGameModule('crazy-eights')!
    const templates: Record<string, CardTemplate> = {
      '8S': { id: '8S', rank: '8', suit: 'spades' },
      KH: { id: 'KH', rank: 'K', suit: 'hearts' },
      '5H': { id: '5H', rank: '5', suit: 'hearts' },
    }
    const table: TableState = {
      templates,
      zoneOrder: ['discard', 'draw', 'hand:1'],
      zones: {
        discard: zone('discard', [card('d1', '5H')]),
        draw: zone('draw', []),
        'hand:1': zone('hand:1', [card('c1', '8S'), card('c2', 'KH')], 1),
      },
    }

    const action = mod.selectAiAction!(
      table,
      {
        phase: 'play',
        currentPlayer: 1,
        currentSuit: 'hearts',
        message: '',
        roundScores: null,
        reshuffleDiscardWhenDrawEmpty: false,
      },
      1,
      () => 0.99,
      { difficulty: 'hard' },
    )

    expect(action).toEqual({ type: 'custom', payload: { cmd: 'c8Play', index: 1 } })
  })

  it('euchre expert sloughs when partner already has the trick', () => {
    const mod = getGameModule('euchre')!
    const templates: Record<string, CardTemplate> = {
      '9H': { id: '9H', rank: '9', suit: 'hearts' },
      AH: { id: 'AH', rank: 'A', suit: 'hearts' },
      TH: { id: 'TH', rank: '10', suit: 'hearts' },
      JS: { id: 'JS', rank: 'J', suit: 'spades' },
      '9C': { id: '9C', rank: '9', suit: 'clubs' },
    }
    const table: TableState = {
      templates,
      zoneOrder: ['trick', 'hand:3'],
      zones: {
        trick: zone('trick', []),
        'hand:3': zone('hand:3', [card('c1', 'JS'), card('c2', '9C')], 3),
      },
    }

    const action = mod.selectAiAction!(
      table,
      {
        phase: 'play',
        currentPlayer: 3,
        trumpSuit: 'spades',
        trick: [
          { player: 0, templateId: '9H' },
          { player: 1, templateId: 'AH' },
          { player: 2, templateId: 'TH' },
        ],
        tricksWon: [0, 0, 0, 0],
        tricksPlayed: 0,
        message: '',
        roundScores: null,
      },
      3,
      () => 0.1,
      { difficulty: 'expert' },
    )

    expect(action).toEqual({ type: 'custom', payload: { cmd: 'echPlay', index: 1 } })
  })
})
