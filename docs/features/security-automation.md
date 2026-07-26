# Security automation (GHAS + Cursor)

This repo uses **GitHub Advanced Security** features, **GitHub Actions** gates, and optional **Cursor Automations** to triage and merge safe dependency updates.

## GitHub tooling in-repo

| Piece | Purpose |
|-------|---------|
| [`.github/dependabot.yml`](../../.github/dependabot.yml) | Weekly npm updates (site + `lambda/`) |
| GitHub CodeQL default setup | Code scanning on PRs and `main` without a competing advanced workflow |
| [`.github/workflows/security-merge.yml`](../../.github/workflows/security-merge.yml) | Auto-merge **Dependabot** PRs for **patch/minor** only |
| [`.github/workflows/security-notify.yml`](../../.github/workflows/security-notify.yml) | Daily webhook to Cursor (optional secrets) |
| [Live tests](./live-tests.md) | Visual regression on PR preview URLs |

### Repository settings (one-time)

In **Settings → Code security and analysis**, enable:

- Dependabot alerts and security updates  
- Secret scanning (and push protection, recommended)  
- Code scanning with **default setup** (do not also add an advanced CodeQL workflow)

### Branch protection on `main`

Require status checks before merge:

- **CI** (lint, unit tests, build, Lambda)  
- **CodeQL**
- **Live tests (preview)** (on PRs that run preview deploy)

## Merge policy

| Source | Auto-merge |
|--------|------------|
| Dependabot, patch or minor semver bump | Yes, when all PR checks pass ([`scripts/security-merge-gate.sh`](../../scripts/security-merge-gate.sh); accepts GraphQL `app/dependabot` and REST `dependabot[bot]`) |
| Dependabot, major bump | No — human review |
| Cursor/agent PR with label `security-fix` | No — human review |
| Secret scanning (credential exposure) | No auto-merge; rotate/revoke out of band |

## Cursor Automations (manual setup)

Create these at [cursor.com/automations](https://cursor.com/automations) for `MichaelJ43/card-game` (adjust org if needed).

### 1. Security PR babysit

- **Triggers:** Pull request opened, pushed, **CI completed** (limit to Dependabot or `security` / `security-fix` labels if the UI allows).  
- **Tools:** Open pull request, Comment on pull request.  
- **Instructions:** Resolve merge conflicts; fix CI within PR scope; run `npm run lint`, `npm run test:ci`, and lambda tests; for Live test failures inspect the Playwright artifact; add label `security-fix` for CodeQL/secret-scan fixes; **do not merge** — comment when ready for human review or when Dependabot auto-merge applies.

### 2. GHAS alert sweep

- **Trigger:** Scheduled daily (e.g. 06:00 UTC).  
- **Tools:** Open pull request.  
- **Instructions:** Use `gh` to list open Dependabot, code-scanning, and secret-scanning alerts without an existing fix PR; open a branch per fix with label `security-fix`; skip non-actionable compliance-only items.

### Webhook bridge

After saving automation **#2**, set repository secrets:

- `CURSOR_AUTOMATION_WEBHOOK` — webhook URL from the automation  
- `CURSOR_AUTOMATION_API_KEY` — API key from the automation  

[`security-notify.yml`](../../.github/workflows/security-notify.yml) POSTs open alert summaries daily (and on `workflow_dispatch`).

## Related docs

- [Live visual tests](./live-tests.md)  
- [AGENTS.md](../../AGENTS.md) — commands  
- [Cursor Automations docs](https://cursor.com/docs/cloud-agent/automations)
