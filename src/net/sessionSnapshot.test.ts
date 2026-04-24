import { describe, expect, it } from 'vitest'
import type { GameManifestYaml, TableState } from '../core/types'
import {
  HIDDEN_CARD_TEMPLATE_ID,
  gridSeatCountFromTable,
  parseWireSeatProfiles,
  projectTableForViewer,
  reconcileManifestPlayersForTable,
} from './sessionSnapshot'

function emptyTableWithGrids(maxPlayerIndex: number): TableState {
  const zones: TableState['zones'] = {}
  for (let i = 0; i <= maxPlayerIndex; i++) {
    zones[`grid:${i}`] = { id: `grid:${i}`, kind: 'grid', defaultFaceUp: false, cards: [] }
  }
  return {
    zones,
    zoneOrder: Object.keys(zones),
    templates: {},
  }
}

describe('gridSeatCountFromTable', () => {
  it('returns null when there are no grid zones', () => {
    const t: TableState = { zones: {}, zoneOrder: [], templates: {} }
    expect(gridSeatCountFromTable(t)).toBeNull()
  })

  it('returns max grid index + 1', () => {
    const t = emptyTableWithGrids(2)
    expect(gridSeatCountFromTable(t)).toBe(3)
  })
})

describe('reconcileManifestPlayersForTable', () => {
  const skyjoYamlLike: GameManifestYaml = {
    id: 'skyjo',
    name: 'Skyjo',
    module: 'skyjo',
    deck: 'skyjo',
    players: { human: 1, ai: 1 },
  }

  it('does nothing when manifest already matches grid count', () => {
    const t = emptyTableWithGrids(1)
    const m = { ...skyjoYamlLike, players: { human: 2, ai: 0 } }
    expect(reconcileManifestPlayersForTable(m, t)).toEqual(m)
  })

  it('grows human slots when YAML under-counts vs table (remote client snapshot)', () => {
    const t = emptyTableWithGrids(2)
    const out = reconcileManifestPlayersForTable(skyjoYamlLike, t)
    expect(out.players).toEqual({ human: 2, ai: 1 })
  })

  it('does not shrink an oversized manifest when grid count is smaller', () => {
    const t = emptyTableWithGrids(1)
    const m = { ...skyjoYamlLike, players: { human: 3, ai: 0 } }
    expect(reconcileManifestPlayersForTable(m, t)).toEqual(m)
  })
})

describe('parseWireSeatProfiles', () => {
  it('parses valid seat profile rows', () => {
    const out = parseWireSeatProfiles([
      { seat: 0, id: 'a-uuid', displayName: 'Host' },
      { seat: 1, id: 'b-uuid', displayName: 'River' },
    ])
    expect(out).toEqual([
      { seat: 0, id: 'a-uuid', displayName: 'Host' },
      { seat: 1, id: 'b-uuid', displayName: 'River' },
    ])
  })

  it('returns undefined for invalid input', () => {
    expect(parseWireSeatProfiles(null)).toBeUndefined()
    expect(parseWireSeatProfiles([])).toBeUndefined()
    expect(parseWireSeatProfiles([{ seat: 0, displayName: 'x' }])).toBeUndefined()
  })
})

describe('projectTableForViewer', () => {
  it('reveals only the viewer hand among hidden hands', () => {
    const t: TableState = {
      templates: {
        a: { id: 'a', rank: 'A', suit: 'spades' },
        k: { id: 'k', rank: 'K', suit: 'hearts' },
        q: { id: 'q', rank: 'Q', suit: 'clubs' },
      },
      zones: {
        'hand:0': {
          id: 'hand:0',
          kind: 'spread',
          defaultFaceUp: false,
          ownerPlayerIndex: 0,
          cards: [{ instanceId: 'c0', templateId: 'a', faceUp: false }],
        },
        'hand:1': {
          id: 'hand:1',
          kind: 'spread',
          defaultFaceUp: false,
          ownerPlayerIndex: 1,
          cards: [{ instanceId: 'c1', templateId: 'k', faceUp: false }],
        },
        'books:0': {
          id: 'books:0',
          kind: 'spread',
          defaultFaceUp: true,
          ownerPlayerIndex: 0,
          cards: [{ instanceId: 'c2', templateId: 'q', faceUp: true }],
        },
      },
      zoneOrder: ['hand:0', 'hand:1', 'books:0'],
    }

    const projected = projectTableForViewer(t, 1)

    expect(projected.zones['hand:1']!.cards[0]).toMatchObject({
      templateId: 'k',
      faceUp: true,
    })
    expect(projected.zones['hand:0']!.cards[0]).toMatchObject({
      templateId: HIDDEN_CARD_TEMPLATE_ID,
      faceUp: false,
    })
    expect(projected.zones['books:0']!.cards[0]).toMatchObject({
      templateId: 'q',
      faceUp: true,
    })
    expect(t.zones['hand:1']!.cards[0]!.faceUp).toBe(false)
  })

  it('does not reveal a hand to spectators', () => {
    const t: TableState = {
      templates: { a: { id: 'a', rank: 'A', suit: 'spades' } },
      zones: {
        'hand:1': {
          id: 'hand:1',
          kind: 'spread',
          defaultFaceUp: false,
          ownerPlayerIndex: 1,
          cards: [{ instanceId: 'c1', templateId: 'a', faceUp: false }],
        },
      },
      zoneOrder: ['hand:1'],
    }

    const projected = projectTableForViewer(t, 1, true)

    expect(projected.zones['hand:1']!.cards[0]).toMatchObject({
      templateId: HIDDEN_CARD_TEMPLATE_ID,
      faceUp: false,
    })
  })
})
