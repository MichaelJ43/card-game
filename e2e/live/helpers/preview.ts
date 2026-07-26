import type { Page } from '@playwright/test'

/** Wait until the shell is painted and web fonts have settled. */
export async function waitForShellReady(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('h1.app__title').waitFor({ state: 'visible' })
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready
    }
  })
  // Allow deferred m43 header scripts to attach without hanging on analytics long-poll.
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(300)
}

export async function setSelectedGame(page: Page, gameId: string): Promise<void> {
  await page.addInitScript((id: string) => {
    localStorage.setItem('card-game:selected-game:v1', JSON.stringify({ id }))
  }, gameId)
}
