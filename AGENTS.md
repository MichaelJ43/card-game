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
| `src/core/discardRecycle.ts` | When the draw pile is empty, optionally **shuffle the discard pile into a new draw pile**; **`isDeckDrawAvailableAfterOptionalRecycle`** for legal-action checks without mutating the table. Used by games with both **`draw`** and **`discard`** when **`reshuffleDiscardWhenDrawEmpty`** is on. |
| `src/core/types.ts` | Shared types: **`CardInstance`**, **`CardTemplate`**, zones, **`GameManifestYaml`**, **`MatchManifestYaml`**, **`GameAction`** variants. |
| `src/core/gameModule.ts` | **`GameModuleContext`** (manifest, templates, rng, `matchCumulativeScores`, optional **`reshuffleDiscardWhenDrawEmpty`**, other house-rule flags for modules). |
| `src/core/match.ts` | **`MatchState`**, **`applyFinishedRound`**, **`createInitialMatchState`**, end condition **`anyAtOrAbove`**, **`winnerIs`**: `lowest` \| `highest`. |
| `src/core/table.ts` | **`createEmptyTable`**, **`cloneTable`**, **`moveTop`**, zone helpers. |
| `src/core/registry.ts` | **`registerGameModule`** / **`getGameModule`** — modules self-register on import. |
| `src/core/aiContext.ts` | **`AiDifficulty`**: `easy` \| `medium` \| `hard`; **`SelectAiContext`** (difficulty + optional match fields for Skyjo AI). |
| `src/data/manifests.ts` | **`GAME_SOURCES`**, **`DECK_SOURCES`**, **`GAME_IDS`** — Vite `?raw` imports wiring ids to YAML strings. |
| `src/data/rulesSources.ts` | **`RULES_SOURCES`**, **`rulesTextForGame`**, **`RulesGameId`** — maps each **`GAME_IDS`** entry to `src/rules/*.md` raw markdown. |
| `src/data/houseRules.ts` | **`localStorage`** persistence for per-game **house rules**; **`createSessionOptionsHouseRules`** merges into **`CreateSessionOptions`**; **`GAMES_WITH_DISCARD_RECYCLE_OPTION`** controls which games show the “reshuffle discard when draw empty” toggle; **`effectiveReshuffleDiscardWhenDrawEmpty`** resolves manifest default + stored preference + session options. |
| `src/decks/*.yaml` | Deck definitions: `standard-52`, `skyjo`, `uno`, `thirty-one-32`, `euchre-24`, `durak-36`, `pinochle-24`, `canasta-108`, `sequence-race-112`, `example-custom`. |
| `src/games/<id>/` | Per-title **`*.yaml` manifest** + **`index.ts`** module (some **game ids** share one **`module`** id). |
| `src/games/*/index.ts` | Implements **`GameModule`**: **`setup`**, **`getLegalActions`**, **`applyAction`**, **`selectAiAction`**, **`statusText`**, optional **`extractMatchRoundScores`** / **`isMatchRoundFinished`**. |
| `src/rules/*.md` | **In-app rules** copy (shown in **Rules** modal); structured with `#` title, `##` sections, numbered lists where possible. |
| `src/ui/TableView.tsx` | Renders zones (stack / spread / grid), **pending column** for Skyjo, **`onTableIntent`**, **active turn** highlight. |
| `src/ui/tableIntent.ts` | **`TableIntent`** types (`card`, `stack`, `zone`) + pointer modifiers. |
| `src/ui/RulesModal.tsx` | Dialog: optional **house-rules panel** + markdown body (headings, lists). |
| `src/ui/GameHouseRulesPanel.tsx` | Per-game toggles/inputs saved to **`houseRules`** storage. |
| `src/ui/CardView.tsx` | Card face/back, Skyjo tiers, standard ranks/suits. |
| `docs/*.md` | Longer **repo documentation** per game (can diverge slightly from modal text). |
| `docs/ui-design.md` | **Shell UI**: header toolbar button classes (`app__btn*`), multiplayer compact row layout (`multiplayerPanel__compact*` in `App.css`). |
| `README.md` | User-facing run instructions and game table linking to `docs/`. |

---

## Runtime flow (high level)

1. User picks **`gameId`** from **`GAME_IDS`** and optionally sets AI count / difficulties / **Rules** options.
2. **`createSession(gameId, rng, carryMatch?, options?)`** in **`src/session.ts`**:
   - Parses manifest from **`GAME_SOURCES[gameId]`** (and may override **`match.targetScore`** from house rules when **not** continuing a match).
   - Applies **`manifestWithAiOpponents`** when **`CreateSessionOptions.aiCount`** is set.
   - Builds **`MatchState`** from manifest when **`match.enabled`** and not **`skipMatch`**, unless **`carryMatch`** is passed (next round).
   - Loads deck YAML, **`buildDeckInstances`**, calls **`module.setup(ctx, instances)`** with **`GameModuleContext`** (including house-rule flags and optional **`reshuffleDiscardWhenDrawEmpty`** for draw+discard games).
3. **`GameSession`** holds **`manifest`**, **`module`**, **`table`**, **`gameState`**, optional **`match`**, optional **`aiPlayerConfig`**.
4. **`App`** dispatches **`module.applyAction`** for button or intent-driven actions; **`TableView`** may call **`onTableIntent`** when zones are allowlisted.
5. When a module implements **`isMatchRoundFinished`** + **`extractMatchRoundScores`**, **`startNextMatchRound`** merges scores via **`applyFinishedRound`** and either ends the match or **`createSession`** again with updated **`carryMatch`** and **`continuationOptionsFromSession`** so house rules persist.

---

## Game manifest (YAML)

Parsed as **`GameManifestYaml`** (`src/core/types.ts`). Important fields:

- **`id`**, **`name`**, **`module`** (registry key — must match **`GameModule.moduleId`** in the TS file), **`deck`** (key into **`DECK_SOURCES`**).
- **`players.human`**, **`players.ai`** — shell often fixes **`human: 1`** and varies AI count via **`manifestWithAiOpponents`**.
- **`match`** (optional): **`enabled`**, **`targetScore`**, **`winnerIs`**, **`endCondition`**, **`startingStack`**, **`scoringMode`**, **`scoreLabel`**, etc.
- **`discardRecycleWhenDrawEmpty`** (optional boolean): default for whether an **empty draw pile** should recycle the **discard** (shuffled) back into **draw** when the game uses both zones. Titles where an empty stock normally **ends** the round (e.g. **thirty-one**) should set **`false`**; casual “keep playing” defaults can set **`true`**. The Rules panel can override per player via **`reshuffleDiscardWhenDrawEmpty`** in **`houseRules`**.

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
- **`GameHouseRulesPanel`** (in Rules modal) edits: **match target**, Skyjo **discard-on-face-up-only**, blackjack **dealer hits soft 17**, War **tie pile size** (1 vs 3), and for games in **`GAMES_WITH_DISCARD_RECYCLE_OPTION`** (**skyjo**, **uno**, **crazy-eights**, **canasta**, **poker-draw**, **thirty-one**): **reshuffle discard into draw when the draw pile is empty** (stored as **`reshuffleDiscardWhenDrawEmpty`**).
- **`createSessionOptionsHouseRules`** merges into **`createSession`**; **`continuationOptionsFromSession`** spreads those options so house rules persist across **next match round**. **`GameModuleContext`** passes **`reshuffleDiscardWhenDrawEmpty`** (and other flags) into **`setup`**; modules that implement recycle call **`recycleDiscardIntoDrawWhenEmpty`** / **`isDeckDrawAvailableAfterOptionalRecycle`** from **`src/core/discardRecycle.ts`**.

Agents changing rules behavior should update **both** the module logic and **`src/rules/*.md`** (and optionally **`docs/`**).

---

## Game / module catalog

| Game id (`GAME_IDS`) | `module` (TS) | Notes |
|----------------------|----------------|-------|
| `war` | `war` | Step-driven skirmish; **`tieDownCards`** house rule. |
| `demo-custom` | `demo-custom` | Sample custom deck. |
| `go-fish` | `go-fish` | Asks, books, draw pile; per-seat AI difficulty. |
| `skyjo` | `skyjo` | Grid, draw/discard, match play; rich AI; **`discardSwapFaceUpOnly`**; optional **discard→draw recycle** when stock empty (**`discardRecycleWhenDrawEmpty`** / Rules toggle). |
| `blackjack` | `blackjack` | Chips, bet/hit/stand; **`dealerHitsSoft17`**. |
| `casino-blackjack` | `blackjack` | Alternate manifest (stacks/target/scoring labels). |
| `baccarat` | `baccarat` | Player/banker bets. |
| `mini-baccarat` | `baccarat` | Alternate manifest. |
| `crazy-eights` | `crazy-eights` | Shedding + eights wild; optional **discard recycle** when draw empty. |
| `switch` | `crazy-eights` | Alternate manifest. |
| `poker-draw` | `poker-draw` | Draw poker style; optional **discard recycle** when deck empty. |
| `heads-up-poker` | `poker-draw` | Alternate manifest. |
| `high-card-duel` | `high-card-duel` | Single-card compare. |
| `red-dog` | `high-card-duel` | Alternate manifest. |
| `uno` | `uno` | Custom **uno** deck; optional **discard recycle** when draw empty. |
| `thirty-one` | `thirty-one` | 32-card Scat-style draw/discard; optional match; **discard recycle** defaults **off** (empty stock often ends the round). |
| `euchre` | `euchre` | 24-card simplified trick race (four seats, fixed AI count). |
| `durak` | `durak` | 36-card two-player attack/defend. |
| `pinochle` | `pinochle` | Double 48-card trick race; templates doubled in `setup`. |
| `canasta` | `canasta` | 108-card draw-two/discard-one drill (not full canasta); optional **discard recycle** when draw empty. |
| `sequence-race` | `sequence-race` | Custom 112-card “Skip-Bo–style” builder. |

---

## Adding a new game (checklist)

1. Add **`src/games/<id>/<id>.yaml`** and **`src/games/<id>/index.ts`** implementing **`GameModule`** + **`registerGameModule`**.
2. Wire **`GAME_SOURCES`** and (if new) **`DECK_SOURCES`** in **`src/data/manifests.ts`** with `?raw` imports.
3. Add **`src/rules/<id>.md`** and an entry in **`RULES_SOURCES`** (`src/data/rulesSources.ts`); extend **`GameHouseRules`** / panel only if new options are needed. For **draw + discard** games that should support “shuffle discard into draw when draw is empty,” wire **`src/core/discardRecycle.ts`**, set **`discardRecycleWhenDrawEmpty`** on the manifest, register the id in **`GAMES_WITH_DISCARD_RECYCLE_OPTION`**, and mirror the **`GameHouseRulesPanel`** + **`createSession`** pattern used by Skyjo / Uno.
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
npm run test     # vitest (watch)
npm run test:ci  # vitest run (used in CI)
```

Backend (AWS Lambda signaling) lives in `lambda/`:

```bash
cd lambda
npm install
npm run build   # tsc -> dist/
npm run bundle  # zip dist/ into http.zip + websocket.zip for Terraform
npm run test    # vitest run
```

Infra lives in `deploy/terraform/aws/` (see its `README.md`). The GitHub Actions
workflow `.github/workflows/deploy.yml` runs build + bundle + terraform apply +
S3 sync + CloudFront invalidation on pushes to `main`. One-time AWS/GitHub
bootstrap steps are tracked in the gitignored `AWS_SETUP.md` (kept out of the
repo on purpose).

---

## Versioning

- `VERSION` holds the current semver tag (must match `package.json#version`).
- Bump together when shipping a release; CI does not enforce this yet.
- Breaking wire changes must bump `PROTOCOL_VERSION` in `src/net/protocol.ts`.

---

## Online multiplayer (high level)

- Star topology: player 0 (local browser) is the **host** and authoritative
  game runner. Clients (seats 1..N) send intents and render host-provided
  snapshots.
- Signaling: short-lived room JWT from a Lambda HTTP API + API Gateway
  WebSocket Lambda that relays `SignalingRelay { to, from, payload }` envelopes.
- Transport: WebRTC DataChannels (single ordered channel `game`).
- Room codes: 6-char base-32 (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`), issued and
  validated by the backend (see `lambda/src/roomCode.ts` and
  `src/net/protocol.ts#isRoomCode`).
- Reconnects: the signaling client backs off and re-sends `hello`; room JWTs
  have TTL `ROOM_TTL_SECONDS` (default 24h). DataChannel reconnection is
  advisory in v1 — a lost `RTCPeerConnection` tears down and the user re-joins
  the same code.

Client-side entry points:

| File | Role |
|------|------|
| `src/net/protocol.ts` | Wire types, room-code helpers, protocol version. |
| `src/net/config.ts` | Reads `VITE_MULTIPLAYER_*` env vars at build time. |
| `src/net/api.ts` | `createRoom` / `joinRoom` HTTP calls. |
| `src/net/signaling.ts` | Auto-reconnecting WebSocket client. |
| `src/net/peer.ts` | `RTCPeerConnection` + DataChannel wrapper. |
| `src/net/host.ts` | `RoomHost` — accepts clients, assigns seats, broadcasts snapshots. |
| `src/net/client.ts` | `RoomClient` — dials host, consumes snapshots, sends intents. |
| `src/ui/MultiplayerPanel.tsx` | Lobby UI (Host / Join / roster / status, **Open chat**); chrome per **`docs/ui-design.md`**; room chat details in **`docs/multiplayer-chat.md`**. |
| `src/session/playerConfig.ts` | `remoteHumanCount`, `gameSupportsOnlineMultiplayer`, `manifestWithPlayerCounts`. |

Backend entry points live in `lambda/src/` (`http.ts`, `websocket.ts`,
`storage.ts`, `auth.ts`, `roomCode.ts`).

### DynamoDB schema (single table `card-game-<env>-rooms`, `PAY_PER_REQUEST`)

| pk | sk | Description |
|----|----|-------------|
| `ROOM#<code>` | `META` | `RoomMeta` — hostPeerId, gameId, createdAt, ttl. |
| `ROOM#<code>` | `CONN#<connectionId>` | Per-connection record (role, peerId, ttl). |
| `CONNIDX#<connectionId>` | `IDX` | Reverse lookup used by `$disconnect` and `relay` without a Scan. |

TTL attribute `ttl` is enabled on the table so idle rooms age out without a
sweeper process.

### Cost posture

- Everything is pay-per-use; a deployed-but-idle environment rounds to ~\$0/month
  (plus a Route 53 hosted zone if you bring a custom domain).
- No `Scan` on hot paths (`relay` uses `GetItem` on the reverse index;
  `listConnections` uses `Query` within a single partition).
- See `AWS_SETUP.md` (gitignored) for repository secrets and
  `deploy/terraform/aws/README.md` for infra details.

### GitHub Actions

- `.github/workflows/ci.yml` — lint, test (site + lambda), build on every PR/push.
- `.github/workflows/deploy.yml` — OIDC-assumed role; applies Terraform, builds
  the site with endpoint URLs baked in, syncs to S3 and invalidates CloudFront.

Required GitHub configuration (repository **secrets** only — no Variables for deploy):

- `AWS_ROLE_ARN`, `ROOM_JWT_SECRET`, `AWS_REGION`, `TF_STATE_BUCKET`, `TF_STATE_LOCK_TABLE`.

Optional repository **Variables** (plaintext) for Vite — set these so every
`npm run build` (CI and deploy) bakes in stable API endpoints without depending
only on the Terraform step output in the same job:

- `VITE_MULTIPLAYER_HTTP_URL` — same value as `terraform output -raw http_api_url` (no trailing slash).
- `VITE_MULTIPLAYER_WS_URL` — same value as `terraform output -raw ws_api_url` (includes stage path, e.g. `/prod`).

Deploy resolves URLs as: **Variables if non-empty, else Terraform outputs** for that run. Copy the two lines from the last successful **Deploy** job summary into Variables once, then re-run **Deploy** (or push) so CloudFront serves a bundle with multiplayer enabled.

### Future backlog (not in this PR)

- **TURN relay** for symmetric-NAT / strict-firewall peers (STUN-only may
  fail). Plan is to add an env-configured managed TURN (Twilio, Cloudflare, or
  self-hosted coturn) behind a feature flag.
- **Per-game host-broadcast integration**: wire each supported game module’s
  `applyAction` output into `RoomHost.broadcastSnapshot` with per-seat
  redaction of hidden information (opponent hands).
- **RNG audit**: centralise `rng` usage through `GameModuleContext` so hosts
  own the single source of randomness in multiplayer rounds.

---

## Conventions for agents

- Prefer **small, focused diffs**; match existing file style and patterns in sibling games.
- **Never** edit unrelated games when fixing one title unless shared core behavior requires it.
- After behavior changes, update **`src/rules/*.md`** (and **`AGENTS.md`** / **`README`** if the architecture list changes).
- **`playerIndex` 0** is the **human** in the shell; AI seats are **1…N**.
- For **header toolbar**, **Rules** modal actions, and **multiplayer** shell controls, follow **`docs/ui-design.md`** and reuse **`app__btnSecondary app__btnToolbar`** from **`src/App.css`** unless there is a strong reason not to.
