import { describe, expect, it } from 'vitest'
import type { GameManifestYaml, TableState } from '../core/types'
import {
  gridSeatCountFromTable,
  parseWireSeatProfiles,
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
