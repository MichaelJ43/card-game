import { shuffleInPlace } from './shuffle'
import type { TableState } from './types'

export interface RecycleDiscardIntoDrawOptions {
  /** When false, no-op. */
  enabled: boolean
  /**
   * When true, keep the current top discard visible and shuffle the rest into the draw pile (Uno / Skyjo style).
   * When false, move all discard cards into the draw pile and shuffle (discard becomes empty).
   */
  preserveTopDiscard: boolean
}

/**
 * When the draw pile is empty and the discard pile has cards, shuffle discard into draw.
 * @returns true if the table was modified.
 */
export function recycleDiscardIntoDrawWhenEmpty(
  table: TableState,
  rng: () => number,
  opts: RecycleDiscardIntoDrawOptions,
): boolean {
  if (!opts.enabled) return false
  const draw = table.zones.draw?.cards
  const disc = table.zones.discard?.cards
  if (!draw || !disc) return false
  if (draw.length > 0) return false
  if (disc.length === 0) return false

  if (opts.preserveTopDiscard) {
    if (disc.length <= 1) return false
    const top = disc.pop()!
    const rest = disc.splice(0, disc.length)
    shuffleInPlace(rest, rng)
    draw.push(...rest)
    disc.length = 0
    disc.push(top)
    return true
  }

  const all = disc.splice(0, disc.length)
  shuffleInPlace(all, rng)
  draw.push(...all)
  return true
}

/**
 * True if the player could draw from the deck: either stock has cards, or recycling discard into draw
 * would refill it (used for legal actions without mutating the table).
 */
export function isDeckDrawAvailableAfterOptionalRecycle(
  table: TableState,
  recycleEnabled: boolean,
  preserveTopDiscard: boolean,
): boolean {
  const draw = table.zones.draw?.cards
  if (!draw) return false
  if (draw.length > 0) return true
  if (!recycleEnabled) return false
  const disc = table.zones.discard?.cards
  if (!disc?.length) return false
  if (preserveTopDiscard) return disc.length > 1
  return true
}
