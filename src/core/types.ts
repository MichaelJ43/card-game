/** Suit for standard playing cards */
export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'

/** Rank label as in deck YAML */
export type Rank =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'
  | 'A'

export interface CardTemplate {
  id: string
  rank?: Rank | string
  suit?: Suit | string
  /** Custom games: arbitrary display fields */
  label?: string
  color?: string
  image?: string
  /** Numeric value for custom deck games */
  value?: number
  /** Skyjo-style numbered cards (−2…12) */
  skyjo?: boolean
  [key: string]: unknown
}

export interface CardInstance {
  instanceId: string
  templateId: string
  faceUp: boolean
}

export type ZoneKind = 'stack' | 'spread' | 'grid'

export interface ZoneConfig {
  id: string
  kind: ZoneKind
  defaultFaceUp?: boolean
  owner?: number
}

export interface Zone {
  id: string
  kind: ZoneKind
  defaultFaceUp: boolean
  ownerPlayerIndex?: number
  cards: CardInstance[]
}

export interface TableState {
  templates: Record<string, CardTemplate>
  zones: Record<string, Zone>
  zoneOrder: string[]
  currentPlayerIndex?: number
}

export interface DeckYaml {
  id: string
  back?: { pattern?: string; [k: string]: unknown }
  cards?: Array<Record<string, unknown> & { id: string; copies?: number }>
  generate?: {
    suits: Suit[] | string[]
    ranks: (Rank | string)[]
  }
  /** Skyjo-style deck: values −2…12 with per-value counts (150 cards total). */
  skyjoDistribution?: Array<{ value: number; count: number }>
}

/** Optional multi-round cumulative scoring (games opt in via module hooks). */
export interface MatchManifestYaml {
  enabled: boolean
  /** Cumulative threshold to trigger match end (e.g. 100 for Skyjo, or chip goal in betting games). */
  targetScore?: number
  winnerIs?: 'lowest' | 'highest'
  endCondition?: 'anyAtOrAbove'
  /**
   * When set, each player starts the match with this many chips (cumulative score).
   * Round deltas can be negative (losses). UI may label scores as “Chips”.
   */
  startingStack?: number
  /** UI label for the score column (e.g. “Chips”, “Points”). */
  scoreLabel?: string
  /** `chips` = betting-style bankrolls; `points` = default abstract scoring. */
  scoringMode?: 'points' | 'chips'
}

export interface GameManifestYaml {
  id: string
  name: string
  /** Registry key for the TS game module */
  module: string
  /** Deck id matching `DeckYaml.id` */
  deck: string
  players: {
    human: number
    ai: number
  }
  zones?: ZoneConfig[]
  ai?: Record<string, unknown>
  /** When set, session may track cumulative scores across rounds (see core/match.ts). */
  match?: MatchManifestYaml
  /**
   * When both draw and discard piles exist: default for “shuffle discard into draw when draw is empty”.
   * House rule can override; see `data/houseRules.ts` per-game defaults.
   */
  discardRecycleWhenDrawEmpty?: boolean
}

export type GameAction =
  | { type: 'step' }
  | { type: 'selectCard'; zoneId: string; cardIndex: number }
  /** Ask another player for a rank (you must hold that rank). */
  | { type: 'goFishAsk'; targetPlayer: number; rank: string }
  /** Pass when you have no legal ask (empty hand and empty deck). */
  | { type: 'goFishPass' }
  /** Skyjo: draw from deck (peek) or take visible discard into hand decision. */
  | { type: 'skyjoDraw'; from: 'deck' | 'discard' }
  /** Swap the pending drawn card with grid cell. */
  | { type: 'skyjoSwapDrawn'; gridIndex: number }
  /** Discard the pending draw and flip one face-down grid card. */
  | { type: 'skyjoDumpDraw'; flipIndex: number }
  /** Replace grid cell with top discard (no pending draw). */
  | { type: 'skyjoTakeDiscard'; gridIndex: number }
  /** Skyjo opening: flip one face-down grid card (each player reveals two before play). */
  | { type: 'skyjoOpeningFlip'; gridIndex: number }
  | { type: 'custom'; payload: Record<string, unknown> }
