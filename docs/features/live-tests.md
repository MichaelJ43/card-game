# Live visual tests (Playwright)

Browser tests run against a **deployed** site URL (PR preview in CI) or a local **`vite preview`** server. They guard shell layout, theme tokens, and screenshots so unintentional UI drift is caught before merge.

## What is covered

| Area | Assertions |
|------|------------|
| Lobby (no deal) | Full-page screenshot, header, Game select, Start deal / Rules, theme CSS variables |
| Blackjack selected | Toolbar partial screenshot, secondary button sizing/colors |
| Rules modal | Dialog visible, in viewport, screenshot |
| Multiplayer lobby | Host / Join placement (when multiplayer is configured at build time) |

In-table card layouts are **out of scope** (RNG); expand only with a deterministic E2E harness.

## Commands

```bash
npm install
npx playwright install chromium   # once per machine

# Local: builds with placeholder multiplayer URLs, starts preview, runs tests
npm run test:live

# CI / preview (PREVIEW_BASE_URL required)
PREVIEW_BASE_URL=https://pr-123.cardgame.michaelj43.dev npm run test:live:ci
```

Screenshot baselines are captured on the **Linux CI runner**. Font metrics differ enough
on macOS to reflow paragraphs, so `ignoreSnapshots` skips screenshot assertions when `CI`
is unset: local runs still check layout, roles, and theme tokens, and CI does the pixel
comparison.

`build:e2e` sets placeholder `VITE_MULTIPLAYER_*` URLs so Host/Join controls render locally without AWS.

Local preview uses the same **HTTPS** dev certificate as `npm run preview` (`@vitejs/plugin-basic-ssl`); Playwright defaults to `https://127.0.0.1:4173` with `ignoreHTTPSErrors: true`.

## CI

- **[`.github/workflows/preview.yml`](../../.github/workflows/preview.yml)** — job **Live tests (preview)** after deploy; waits for `PREVIEW_BASE_URL` to return HTTP 200, then runs `npm run test:live:ci`.
- On failure, the **playwright-report** artifact is uploaded.

Add **Live tests (preview)** as a required check on `main` when you enable branch protection (see [security-automation.md](./security-automation.md)).

## Updating snapshots

1. Make the intentional UI change and push; **Live tests (preview)** fails on the drift.
2. Download the run's **`playwright-snapshots-pr-<n>`** artifact — the same job recaptures
   baselines on the runner after a failure.
3. Compare against the **`playwright-report-pr-<n>`** artifact to confirm the diff was
   intended, then commit the files into `e2e/live/*-snapshots/`.
4. Note the visual change in the PR description.

Dynamic regions are excluded rather than baselined: the cloud AI bar (`.app__llmBar`)
resolves asynchronously, so it is masked in full-page screenshots.

Shared **m43** CSS from `static.michaelj43.dev` can change appearance without app code changes; refresh baselines if that CDN update was deliberate.

## Flakes

- Preview deploy + CloudFront invalidation: the workflow waits up to ~10 minutes for HTTP 200.
- Playwright uses `retries: 2` in CI and disables motion for stable screenshots.
