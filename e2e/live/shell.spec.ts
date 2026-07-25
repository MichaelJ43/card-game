import { test, expect, type Page } from '@playwright/test'
import { waitForShellReady, setSelectedGame } from './helpers/preview'
import { expectToRightOf } from './helpers/layout'
import { expectToolbarSecondaryButton, expectRootThemeAliases } from './helpers/theme'

// The cloud AI bar reflects an in-flight capability request, so its text differs run to run.
const nondeterministicRegions = (page: Page) => [page.locator('.app__llmBar')]

test.describe('Live shell (lobby)', () => {
  test.beforeEach(async ({ page }) => {
    await setSelectedGame(page, 'go-fish')
    await waitForShellReady(page)
  })

  test('lobby screenshot and header chrome', async ({ page }) => {
    await expect(page.locator('h1.app__title')).toHaveText('Card table')
    await expect(page.getByLabel('Game')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start deal' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rules' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Online play' })).toBeVisible()

    await expectRootThemeAliases(page)
    await expectToolbarSecondaryButton(page.getByRole('button', { name: 'Rules' }))

    const gameSelect = page.getByLabel('Game')
    const rulesBtn = page.getByRole('button', { name: 'Rules' })
    await expectToRightOf(gameSelect, rulesBtn)

    await expect(page).toHaveScreenshot('shell-lobby.png', {
      fullPage: true,
      mask: nondeterministicRegions(page),
    })
  })

  test('blackjack toolbar controls', async ({ page }) => {
    await page.getByLabel('Game').selectOption('blackjack')
    await expect(page.getByLabel('Game')).toHaveValue('blackjack')
    const startDeal = page.getByRole('button', { name: 'Start deal' })
    await expectToolbarSecondaryButton(startDeal)
    await expect(page.locator('.app__toolbarMain')).toHaveScreenshot('shell-toolbar-blackjack.png')
  })

  test('rules modal layout', async ({ page }) => {
    await page.getByRole('button', { name: 'Rules' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible()

    const dialogBox = await dialog.boundingBox()
    const viewport = page.viewportSize()
    expect(dialogBox).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(dialogBox!.width).toBeLessThanOrEqual(viewport!.width)
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0)

    await expect(dialog).toHaveScreenshot('shell-rules-modal.png')
  })
})

test.describe('Live shell (multiplayer lobby)', () => {
  test.beforeEach(async ({ page }) => {
    await setSelectedGame(page, 'go-fish')
    await waitForShellReady(page)
  })

  test('host/join row actions align to the right', async ({ page }) => {
    const notConfigured = page.getByText('Multiplayer is not configured')
    if (await notConfigured.isVisible()) {
      test.skip()
    }
    const hostBtn = page.getByRole('button', { name: 'Host game' })
    const joinBtn = page.getByRole('button', { name: 'Join' })
    await expect(hostBtn).toBeVisible()
    await expectToRightOf(hostBtn, joinBtn)
    await expect(page.locator('.multiplayerPanel')).toHaveScreenshot('shell-multiplayer-lobby.png')
  })
})
