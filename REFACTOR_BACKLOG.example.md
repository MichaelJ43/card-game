# Refactor backlog (example)

Copy this file to **`REFACTOR_BACKLOG.local.md`** (gitignored) and track deferred work there.

## Seed ideas

- **Intent routing**: extract `handleTableIntent` branches from `App` into `src/shell/intents/<gameId>.ts` registries.
- **`dispatchAction` middleware**: single place for analytics, audio cues, FLIP capture, move ledger, multiplayer forwarding.
- **Snapshot types**: optionally include truncated move ledger in wire snapshots for refresh parity (or accept refresh clears history).
- **Tests**: golden tests for per-game `buildLlmObservation` redaction, FLIP math helper stability.
