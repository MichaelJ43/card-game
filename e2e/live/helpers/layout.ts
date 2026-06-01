import { expect, type Locator } from '@playwright/test'

/** `outer` should be to the right of `inner` (same row) with a small gap. */
export async function expectToRightOf(inner: Locator, outer: Locator, minGapPx = 4): Promise<void> {
  const a = await inner.boundingBox()
  const b = await outer.boundingBox()
  expect(a, 'inner element missing layout box').not.toBeNull()
  expect(b, 'outer element missing layout box').not.toBeNull()
  expect(b!.x).toBeGreaterThanOrEqual(a!.x + a!.width + minGapPx - 2)
}

/** Tail actions align to the end of a flex row (compact multiplayer strip). */
export async function expectTailAlignedRight(row: Locator, tail: Locator): Promise<void> {
  const rowBox = await row.boundingBox()
  const tailBox = await tail.boundingBox()
  expect(rowBox).not.toBeNull()
  expect(tailBox).not.toBeNull()
  const rowRight = rowBox!.x + rowBox!.width
  const tailRight = tailBox!.x + tailBox!.width
  expect(Math.abs(rowRight - tailRight)).toBeLessThan(8)
}
