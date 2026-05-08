# Table AI — LLM behavior and context

This document describes **what the model sees** and **how moves are chosen** when “Smarter AI” is enabled on a solo table. Deployment, auth, and budget details remain in [llm-table-ai.md](llm-table-ai.md).

## When LLM runs

- Only for **solo / local** play (`session.net` unset). Online tables use host heuristics only.
- The user turns on Smarter AI in the toolbar and must have a valid shared-auth session; see [llm-table-ai.md](llm-table-ai.md).

## Heuristics vs LLM

- Each game implements **`selectAiAction`** (heuristic policy) on [`GameModule`](../../src/core/gameModule.ts).
- [`pickTableAiAction`](../../src/ai/tableAiMove.ts) asks the cloud for a **legal move index** when LLM mode is on; on failure or missing auth it falls back to **`selectAiAction`**.
- The returned policy is either **`llm`** (API succeeded) or **`heuristic`**.

## Context sent to `/ai/move`

The client posts (see [`requestLlmMove`](../../src/net/llmApi.ts)):

| Field | Role |
|--------|------|
| `observation` | **Role-aware** table view for the acting seat: face-up public cards, `??` for hidden opponent cards, full detail for that seat’s own hidden cards. |
| `tableDigest` | Legacy / short copy of observation for backward compatibility. |
| `rulesDigest` | Trimmed in-app rules markdown for this `gameId`. |
| `houseRules` | Parsed [`GameHouseRules`](../../src/data/houseRules.ts) for the title. |
| `match` | Match config + cumulative scores when a match is active. |
| `moveHistory` | Recent [`moveLedger`](../../src/session/moveLedger.ts) entries: seat, `human` / `heuristic` / `llm`, short summary. |
| `heuristicCatalog` | Excerpt from build-generated [`heuristic-catalog.json`](../../src/llm/generated/heuristic-catalog.json) (JSDoc scraped from each game’s `selectAiAction`). |
| `choices` | Legal actions with optional per-game labels via **`describeLegalChoice`** on [`GameModule`](../../src/core/gameModule.ts). |

The Lambda assembles the user prompt in [`buildTableAiUserPrompt`](../../lambda/src/llm/prompt.ts) (server-side size caps apply).

## Move ledger

- On each successful apply on the **authoritative browser** (solo table, or multiplayer **host** applying local + remote intents), the shell appends one ledger row (`human`, `heuristic`, or `llm`).
- **Multiplayer clients** never receive `moveLedger` on viewer snapshots—we trust the host only; history exists for host-side LLM context and solo `localStorage` resume (full snapshot serialization).
- This lets the solo/host LLM notice patterns when `moveHistory` is populated.
- Optional module hook **`summarizeLedgerAction`** shortens the stored line; otherwise a type + payload snippet is used.

## Per-game overrides

Optional on **`GameModule`**:

- **`buildLlmObservation`** — replace the default role-aware digest.
- **`describeLegalChoice`** — human-readable labels instead of raw JSON.
- **`summarizeLedgerAction`** — custom ledger summary.

## Regenerating the heuristic catalog

```bash
npm run gen:ai-catalog
```

`npm run build` runs this automatically. Commit updates to [`src/llm/generated/heuristic-catalog.json`](../../src/llm/generated/heuristic-catalog.json) when you change `selectAiAction` JSDoc.
