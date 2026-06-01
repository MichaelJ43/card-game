import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PREVIEW_BASE_URL ?? 'https://127.0.0.1:4173'
const useExternalPreview = Boolean(process.env.PREVIEW_BASE_URL)

export default defineConfig({
  testDir: 'e2e/live',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    reducedMotion: 'reduce',
    trace: process.env.CI ? 'on-first-retry' : 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  expect: {
    toHaveScreenshot: {
      // Slight tolerance for font rasterization differences between Linux CI and local macOS.
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  webServer: useExternalPreview
    ? undefined
    : {
        command: 'npm run build:e2e && npm run preview -- --host 127.0.0.1 --port 4173',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        ignoreHTTPSErrors: true,
      },
})
