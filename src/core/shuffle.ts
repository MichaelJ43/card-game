import type { CardInstance } from './types'

/** Mulberry32 PRNG from seed (32-bit) */
export function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates shuffle in place; returns same array */
export function shuffleInPlace<T>(arr: T[], rng: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function shuffleCards(
  cards: CardInstance[],
  options?: { seed?: number },
): CardInstance[] {
  const rng = options?.seed !== undefined ? mulberry32(options.seed) : Math.random
  return shuffleInPlace([...cards], rng)
}
