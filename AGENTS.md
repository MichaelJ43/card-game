# Agent / contributor guide — card-game

This document summarizes how the **card-game** repository is structured, how games plug into the **table engine**, and where rules, decks, AI, and documentation live. Use it as orientation for coding agents and humans.

## What this project is

- **Browser-only** card table: **React 19**, **TypeScript**, **Vite**.
- **Games** are defined by **YAML manifests** + **YAML decks**, implemented in **TypeScript game modules**.
- The **shell** (`src/App.tsx`) creates a **session**, renders **`TableView`**, maps **table intents** to **`GameAction`s**, and optionally tracks **multi-round match** scoring (points or chip-style bankrolls).
- **No backend**; state is in-memory React state, with **house rules** persisted in **`localStorage`**.

---

## Repository layout

| Path | Purpose |
|------|--------|
| `src/App.tsx` | Game picker, session lifecycle, match panel, table intents (Go Fish, Skyjo, etc.), **Rules** modal, AI timers for supported games. |
| `src/session.ts` | **`createSession`**, **`startNextMatchRound`**, **`continuationOptionsFromSession`** (preserve house rules between match rounds). |
| `src/session/playerConfig.ts` | **`CreateSessionOptions`** (AI count/difficulties, `skipMatch`, house-rule fields), **`gameSupportsConfigurableAi`**, **`clampAiOpponentCount`**, manifest AI count normalization. |
| `src/core/` | **`GameModule`** contract, **`TableState`**, **`GameAction`**, **`MatchState`**, deck/build helpers, **`registerGameModule`**, shuffle, YAML parsing entry points. |
| `src/core/types.ts` | Shared types: **`CardInstance`**, **`CardTemplate`**, zones, **`GameManifestYaml`**, **`MatchManifestYaml`**, **`GameAction`** variants. |
| `src/core/gameModule.ts` | **`GameModuleContext`** (manifest, templates, rng, `matchCumulativeScores`, optional house-rule flags for modules). |
| `src/core/match.ts` | **`MatchState`**, **`applyFinishedRound`**, **`createInitialMatchState`**, end condition **`anyAtOrAbove`**, **`winnerIs`**: `lowest` \| `highest`. |
| `src/core/table.ts` | **`createEmptyTable`**, **`cloneTable`**, **`moveTop`**, zone helpers. |
| `src/core/registry.ts` | **`registerGameModule`** / **`getGameModule`** — modules self-register on import. |
| `src/core/aiContext.ts` | **`AiDifficulty`**: `easy` \| `medium` \| `hard`; **`SelectAiContext`** (difficulty + optional match fields for Skyjo AI). |
| `src/data/manifests.ts` | **`GAME_SOURCES`**, **`DECK_SOURCES`**, **`GAME_IDS`** — Vite `?raw` imports wiring ids to YAML strings. |
| `src/data/rulesSources.ts` | **`RULES_SOURCES`**, **`rulesTextForGame`**, **`RulesGameId`** — maps each **`GAME_IDS`** entry to `src/rules/*.md` raw markdown. |
| `src/data/houseRules.ts` | **`localStorage`** persistence for per-game **house rules**; **`createSessionOptionsHouseRules`** merges into **`CreateSessionOptions`**. |
| `src/decks/*.yaml` | Deck definitions: `standard-52`, `skyjo`, `uno`, `example-custom`. |
| `src/games/<id>/` | Per-title **`*.yaml` manifest** + **`index.ts`** module (some **game ids** share one **`module`** id). |
| `src/games/*/index.ts` | Implements **`GameModule`**: **`setup`**, **`getLegalActions`**, **`applyAction`**, **`selectAiAction`**, **`statusText`**, optional **`extractMatchRoundScores`** / **`isMatchRoundFinished`**. |
| `src/rules/*.md` | **In-app rules** copy (shown in **Rules** modal); structured with `#` title, `##` sections, numbered lists where possible. |
| `src/ui/TableView.tsx` | Renders zones (stack / spread / grid), **pending column** for Skyjo, **`onTableIntent`**, **active turn** highlight. |
| `src/ui/tableIntent.ts` | **`TableIntent`** types (`card`, `stack`, `zone`) + pointer modifiers. |
| `src/ui/RulesModal.tsx` | Dialog: optional **house-rules panel** + markdown body (headings, lists). |
| `src/ui/GameHouseRulesPanel.tsx` | Per-game toggles/inputs saved to **`houseRules`** storage. |
| `src/ui/CardView.tsx` | Card face/back, Skyjo tiers, standard ranks/suits. |
| `docs/*.md` | Longer **repo documentation** per game (can diverge slightly from modal text). |
| `README.md` | User-facing run instructions and game table linking to `docs/`. |

---

## Runtime flow (high level)

1. User picks **`gameId`** from **`GAME_IDS`** and optionally sets AI count / difficulties / **Rules** options.
2. **`createSession(gameId, rng, carryMatch?, options?)`** in **`src/session.ts`**:
   - Parses manifest from **`GAME_SOURCES[gameId]`** (and may override **`match.targetScore`** from house rules when **not** continuing a match).
   - Applies **`manifestWithAiOpponents`** when **`CreateSessionOptions.aiCount`** is set.
   - Builds **`MatchState`** from manifest when **`match.enabled`** and not **`skipMatch`**, unless **`carryMatch`** is passed (next round).
   - Loads deck YAML, **`buildDeckInstances`**, calls **`module.setup(ctx, instances)`** with **`GameModuleContext`** (including house-rule flags).
3. **`GameSession`** holds **`manifest`**, **`module`**, **`table`**, **`gameState`**, optional **`match`**, optional **`aiPlayerConfig`**.
4. **`App`** dispatches **`module.applyAction`** for button or intent-driven actions; **`TableView`** may call **`onTableIntent`** when zones are allowlisted.
5. When a module implements **`isMatchRoundFinished`** + **`extractMatchRoundScores`**, **`startNextMatchRound`** merges scores via **`applyFinishedRound`** and either ends the match or **`createSession`** again with updated **`carryMatch`** and **`continuationOptionsFromSession`** so house rules persist.

---

## Game manifest (YAML)

Parsed as **`GameManifestYaml`** (`src/core/types.ts`). Important fields:

- **`id`**, **`name`**, **`module`** (registry key — must match **`GameModule.moduleId`** in the TS file), **`deck`** (key into **`DECK_SOURCES`**).
- **`players.human`**, **`players.ai`** — shell often fixes **`human: 1`** and varies AI count via **`manifestWithAiOpponents`**.
- **`match`** (optional): **`enabled`**, **`targetScore`**, **`winnerIs`**, **`endCondition`**, **`startingStack`**, **`scoringMode`**, **`scoreLabel`**, etc.

The **game id** in the menu is the manifest **`id`** (e.g. `casino-blackjack`), not always the same string as **`module`** (e.g. `blackjack`).

---

## Deck YAML

Loaded via **`parseDeckYaml`** / **`buildDeckInstances`** (`src/core/deck.ts` — agents should open that file for details). Decks can use:

- **`generate`** (suits × ranks),
- explicit **`cards`** with **`copies`**,
- or **`skyjoDistribution`** for Skyjo-style value counts.

Templates become **`CardTemplate`** records; instances are **`CardInstance`** (`templateId`, `faceUp`, `instanceId`).

---

## Table model

- **`TableState`**: **`zones`** (id → **`Zone`**), **`zoneOrder`**, **`templates`**.
- **`Zone`**: **`kind`** `stack` \| `spread` \| `grid`**, **`cards`**, optional **`ownerPlayerIndex`**.
- Convention: zone ids like **`hand:0`**, **`grid:2`**, **`draw`**, **`discard`**, **`skirmish`**, **`pile:1`**, **`books:0`**, etc.

---

## `GameModule` interface

Defined in **`src/core/gameModule.ts`**. Each game implements:

| Method | Role |
|--------|------|
| **`setup(ctx, instances)`** | Build **`table`** + initial **`gameState`**. |
| **`getLegalActions(table, gameState)`** | List legal **`GameAction`** for automation / debugging. |
| **`applyAction(table, gameState, action)`** | Immutable-style update: clone if needed, return **`ApplyResult`** with optional **`error`**. |
| **`selectAiAction(table, gameState, playerIndex, rng, context)`** | Return next **`GameAction`** for AI seat, or **`null`**. |
| **`statusText(table, gameState)`** | Short string for UI. |
| **`extractMatchRoundScores` / `isMatchRoundFinished`** | Optional; required for **`startNextMatchRound`**. |

Register at bottom of module file: **`registerGameModule(myModule)`**.

---

## `GameAction` union

Central definition in **`src/core/types.ts`**. Examples: **`skyjoDraw`**, **`skyjoSwapDrawn`**, **`goFishAsk`**, **`custom`** (payload with string **`cmd`** for blackjack/baccarat/poker/uno, etc.). The **shell** and modules must agree on action shapes.

---

## AI

- **`SelectAiContext`** includes **`difficulty`** and (for Skyjo) optional **`matchCumulativeScores`**, **`matchTargetScore`**.
- **`gameSupportsConfigurableAi`**: games where the user can set **AI opponent count** (capped at 1 for “heads-up only” ids — see **`HEADS_UP_GAME_IDS`** in **`playerConfig.ts`**).
- **`gameSupportsPerSeatAiDifficulty`**: currently **`go-fish`** and **`skyjo`** — **`App`** renders per-seat difficulty selects and passes them in **`CreateSessionOptions.aiDifficulties`**.
- Other titles may use **`selectAiAction`** with a fixed difficulty in **`useEffect`** (e.g. Crazy Eights, Uno) or **`null`** if the game does not use table AI turns the same way.

When adding AI to a game, implement **`selectAiAction`** and ensure **`getLegalActions`** matches what humans can do.

---

## Table UI intents

Not all games use **`onTableIntent`**. **`App.tsx`** builds an **`intentZoneAllowlist`** per active game (e.g. Skyjo: **`draw`**, **`grid:0`**, **`discard`**; Go Fish: hand + opponents). **`TableView`** emits **`TableIntent`**; **`App`** translates them to **`GameAction`s** (including Skyjo dump-step UX, Shift+click shortcuts, etc.).

---

## Rules documentation (two layers)

1. **`src/rules/<gameId>.md`** — Bundled as raw markdown; **`rulesTextForGame`**; shown in **Rules** modal. **`RulesModal`** renders `#` title separately and supports **`##`**, ordered lists, bullets.
2. **`docs/<topic>.md`** — Repo-level notes; **`README.md`** links here for humans.

Keep **`RulesGameId`** in sync with **`GAME_IDS`** in **`rulesSources.ts`**.

---

## House rules (optional table options)

- **`src/data/houseRules.ts`**: **`localStorage`** key **`card-game:house-rules:v1`**, per **`RulesGameId`**.
- **`GameHouseRulesPanel`** (in Rules modal) edits: **match target**, Skyjo **discard-on-face-up-only**, blackjack **dealer hits soft 17**, War **tie pile size** (1 vs 3).
- **`createSessionOptionsHouseRules`** merges into **`createSession`**; **`GameModuleContext`** passes module-specific flags into **`setup`**.

Agents changing rules behavior should update **both** the module logic and **`src/rules/*.md`** (and optionally **`docs/`**).

---

## Game / module catalog

| Game id (`GAME_IDS`) | `module` (TS) | Notes |
|----------------------|----------------|-------|
| `war` | `war` | Step-driven skirmish; **`tieDownCards`** house rule. |
| `demo-custom` | `demo-custom` | Sample custom deck. |
| `go-fish` | `go-fish` | Asks, books, draw pile; per-seat AI difficulty. |
| `skyjo` | `skyjo` | Grid, draw/discard, match play; rich AI; **`discardSwapFaceUpOnly`**. |
| `blackjack` | `blackjack` | Chips, bet/hit/stand; **`dealerHitsSoft17`**. |
| `casino-blackjack` | `blackjack` | Alternate manifest (stacks/target/scoring labels). |
| `baccarat` | `baccarat` | Player/banker bets. |
| `mini-baccarat` | `baccarat` | Alternate manifest. |
| `crazy-eights` | `crazy-eights` | Shedding + eights wild. |
| `switch` | `crazy-eights` | Alternate manifest. |
| `poker-draw` | `poker-draw` | Draw poker style. |
| `heads-up-poker` | `poker-draw` | Alternate manifest. |
| `high-card-duel` | `high-card-duel` | Single-card compare. |
| `red-dog` | `high-card-duel` | Alternate manifest. |
| `uno` | `uno` | Custom **uno** deck. |

---

## Adding a new game (checklist)

1. Add **`src/games/<id>/<id>.yaml`** and **`src/games/<id>/index.ts`** implementing **`GameModule`** + **`registerGameModule`**.
2. Wire **`GAME_SOURCES`** and (if new) **`DECK_SOURCES`** in **`src/data/manifests.ts`** with `?raw` imports.
3. Add **`src/rules/<id>.md`** and an entry in **`RULES_SOURCES`** (`src/data/rulesSources.ts`); extend **`GameHouseRules`** / panel only if new options are needed.
4. Update **`App.tsx`** if the shell must handle intents, custom buttons, or special UI (copy patterns from similar games).
5. Add **`docs/<id>.md`** and a **README** table row if you want public doc parity.
6. Run **`npm run build`** and **`npm run lint`**.

---

## Commands

```bash
npm install
npm run dev      # dev server
npm run build    # tsc + vite build
npm run lint     # eslint
npm run preview  # serve production build
```

---

## Conventions for agents

- Prefer **small, focused diffs**; match existing file style and patterns in sibling games.
- **Never** edit unrelated games when fixing one title unless shared core behavior requires it.
- After behavior changes, update **`src/rules/*.md`** (and **`AGENTS.md`** / **`README`** if the architecture list changes).
- **`playerIndex` 0** is the **human** in the shell; AI seats are **1…N**.
