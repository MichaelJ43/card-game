import type { GameManifestYaml } from '../core/types'
import type { CreateSessionOptions } from '../session/playerConfig'
import type { RulesGameId } from './rulesSources'

const STORAGE_KEY = 'card-game:house-rules:v1'

/** Per-game optional overrides persisted in localStorage. */
export interface GameHouseRules {
  /** When the manifest enables match scoring, cumulative goal to end the match. */
  matchTargetScore?: number
  /** Skyjo: discard may only be swapped onto face-up grid cards. */
  skyjoDiscardSwapFaceUpOnly?: boolean
  /** Blackjack variants: dealer draws again on soft 17. */
  dealerHitsSoft17?: boolean
  /** War: face-down cards placed before each tie-break flip (1 = quick, 3 = classic). */
  warTieDownCards?: 1 | 3
  /**
   * When true, empty draw pile is refilled by shuffling the discard pile (games with draw + discard only).
   * Omitted = use manifest default or built-in per-game default.
   */
  reshuffleDiscardWhenDrawEmpty?: boolean
  /** Uno: keep drawing from the pile until a card can be played, then you must play that card. */
  unoDrawUntilPlayable?: boolean
}

/** Games that expose the discard→draw recycle toggle in Rules → Options. */
export const GAMES_WITH_DISCARD_RECYCLE_OPTION: ReadonlySet<RulesGameId> = new Set([
  'skyjo',
  'uno',
  'crazy-eights',
  'canasta',
  'poker-draw',
  'thirty-one',
])

/** Built-in default when manifest + house rule do not set a preference. */
const DISCARD_RECYCLE_DEFAULT_BY_GAME: Partial<Record<RulesGameId, boolean>> = {
  skyjo: true,
  uno: true,
  'crazy-eights': true,
  canasta: true,
  'poker-draw': true,
  'thirty-one': false,
}

export type HouseRulesStore = Partial<Record<RulesGameId, GameHouseRules>>

export function loadHouseRulesStore(): HouseRulesStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as HouseRulesStore
  } catch {
    return {}
  }
}

export function saveHouseRulesStore(store: HouseRulesStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* ignore quota / private mode */
  }
}

export function getHouseRulesForGame(gameId: RulesGameId): GameHouseRules {
  return { ...(loadHouseRulesStore()[gameId] ?? {}) }
}

type HouseRulesPatch = Partial<{ [K in keyof GameHouseRules]: GameHouseRules[K] | null }>

/** Pass `null` for a field to remove it from storage (revert to manifest default). */
export function patchHouseRulesForGame(gameId: RulesGameId, patch: HouseRulesPatch): HouseRulesStore {
  const all = loadHouseRulesStore()
  const prev = { ...(all[gameId] ?? {}) }
  for (const key of Object.keys(patch) as (keyof GameHouseRules)[]) {
    const v = patch[key]
    if (v === undefined) continue
    if (v === null) delete prev[key]
    else (prev as Record<string, unknown>)[key as string] = v
  }
  const next: HouseRulesStore = { ...all }
  if (Object.keys(prev).length === 0) {
    delete next[gameId]
  } else {
    next[gameId] = prev
  }
  saveHouseRulesStore(next)
  return next
}

/** Manifest + built-in default only (no saved house rule). */
export function defaultReshuffleDiscardWhenDrawEmpty(gameId: RulesGameId, manifest: GameManifestYaml): boolean {
  if (typeof manifest.discardRecycleWhenDrawEmpty === 'boolean') return manifest.discardRecycleWhenDrawEmpty
  return DISCARD_RECYCLE_DEFAULT_BY_GAME[gameId] ?? false
}

export function effectiveReshuffleDiscardWhenDrawEmpty(
  gameId: RulesGameId,
  manifest: GameManifestYaml,
  options?: CreateSessionOptions,
): boolean {
  if (options?.reshuffleDiscardWhenDrawEmpty === true) return true
  if (options?.reshuffleDiscardWhenDrawEmpty === false) return false
  const hr = getHouseRulesForGame(gameId)
  if (hr.reshuffleDiscardWhenDrawEmpty === true) return true
  if (hr.reshuffleDiscardWhenDrawEmpty === false) return false
  return defaultReshuffleDiscardWhenDrawEmpty(gameId, manifest)
}

export function clampMatchTargetScore(n: number, fallback: number): number {
  const x = Math.floor(Number(n))
  if (!Number.isFinite(x)) return fallback
  return Math.max(10, Math.min(999, x))
}

/** Values merged into {@link CreateSessionOptions} when starting a deal. */
export function createSessionOptionsHouseRules(gameId: RulesGameId): Partial<CreateSessionOptions> {
  const hr = getHouseRulesForGame(gameId)
  const o: Partial<CreateSessionOptions> = {}
  if (hr.matchTargetScore != null) o.matchTargetScore = hr.matchTargetScore
  if (hr.skyjoDiscardSwapFaceUpOnly) o.skyjoDiscardSwapFaceUpOnly = true
  if (hr.dealerHitsSoft17) o.dealerHitsSoft17 = true
  if (hr.warTieDownCards === 1 || hr.warTieDownCards === 3) o.warTieDownCards = hr.warTieDownCards
  if (hr.reshuffleDiscardWhenDrawEmpty === true) o.reshuffleDiscardWhenDrawEmpty = true
  if (hr.reshuffleDiscardWhenDrawEmpty === false) o.reshuffleDiscardWhenDrawEmpty = false
  if (hr.unoDrawUntilPlayable === true) o.unoDrawUntilPlayable = true
  if (hr.unoDrawUntilPlayable === false) o.unoDrawUntilPlayable = false
  return o
}

export function effectiveUnoDrawUntilPlayable(gameId: RulesGameId, options?: CreateSessionOptions): boolean {
  if (gameId !== 'uno') return false
  if (options?.unoDrawUntilPlayable === true) return true
  if (options?.unoDrawUntilPlayable === false) return false
  return !!getHouseRulesForGame('uno').unoDrawUntilPlayable
}
