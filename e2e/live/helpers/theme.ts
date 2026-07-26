import { expect, type Locator } from '@playwright/test'

/** Toolbar secondary buttons use theme tokens (see docs/ui-design.md). */
export async function expectToolbarSecondaryButton(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible()
  const styles = await locator.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      minHeight: cs.minHeight,
      color: cs.color,
      borderTopColor: cs.borderTopColor,
      backgroundColor: cs.backgroundColor,
    }
  })
  // app__btnToolbar uses min-height: 2.5rem; root font-size is 18px (src/index.css).
  expect(styles.minHeight).toBe('45px')
  expect(styles.color).not.toBe('rgba(0, 0, 0, 0)')
  expect(styles.borderTopColor).not.toBe('rgba(0, 0, 0, 0)')
}

/** Root theme aliases map to m43 tokens (src/index.css). */
export async function expectRootThemeAliases(page: import('@playwright/test').Page): Promise<void> {
  const vars = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    return {
      text: root.getPropertyValue('--text').trim(),
      textH: root.getPropertyValue('--text-h').trim(),
      bg: root.getPropertyValue('--bg').trim(),
      border: root.getPropertyValue('--border').trim(),
    }
  })
  expect(vars.text.length).toBeGreaterThan(0)
  expect(vars.textH.length).toBeGreaterThan(0)
  expect(vars.bg.length).toBeGreaterThan(0)
  expect(vars.border.length).toBeGreaterThan(0)
}
