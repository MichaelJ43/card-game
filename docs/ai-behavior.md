# Table AI: difficulties and per-game behavior

The shell moves AI opponents on your behalf by calling each game’s `selectAiAction` with a `SelectAiContext` (see `src/core/aiContext.ts` and `GameModule` in `src/core/gameModule.ts`).

- **`SelectAiContext.difficulty`** is one of **`easy`**, **`medium`**, **`hard`**, or **`expert`**. It is only **meaningful** when the game module actually reads it (today: **Go Fish** and **Skyjo**).
- **`SelectAiContext.matchCumulativeScores`** and **`matchTargetScore`** are passed for **Skyjo** match play so the AI can consider the finisher-doubling rule.

## Toolbar: per-seat difficulty

The **Game** toolbar shows a difficulty control **only** for games in `gameSupportsPerSeatAiDifficulty` (`src/session/playerConfig.ts`):

| Game        | Per-seat difficulty in UI? |
|------------|----------------------------|
| **Go Fish** | Yes (one control per AI seat) |
| **Skyjo**   | Yes (one control per AI seat) |
| Other games | No — changing the stored difficulty in state does not affect their logic unless noted below. |

## What each level means (when implemented)

| Level     | Role |
|-----------|------|
| **Easy**  | Weaker, more random play; more mistakes. |
| **Medium** | Baseline: mixed or “reasonable default” heuristics. |
| **Hard**   | Stronger heuristics; fewer random errors. |
| **Expert** | Stronger than **hard** where a separate policy exists (only **Skyjo** has extra logic beyond **hard**; **Go Fish** treats **expert** like **hard**). |

## Games that use `difficulty` in `selectAiAction`

### Go Fish (`go-fish`)

- **Medium**: chooses a **uniform random** legal ask (rank + target player) among all legal `goFishAsk` actions.
- **Hard** and **Expert**: score every legal ask with a small heuristic (favor asking ranks you already hold, and large opponent hands), then pick **uniformly among the highest-scoring** asks. **Expert** is intentionally the same as **hard** here.
- **Easy**: often picks among the **lowest-scoring** (weaker) asks; some of the time plays a **fully random** legal ask to simulate mistakes.

### Skyjo (`skyjo`)

Match fields (`matchCumulativeScores`, `matchTargetScore`) are used to estimate the cost of **calling/finishing** when the round would end with you as finisher and your row score might be doubled (not lowest).

- **Easy**: more randomness on swaps/dumps, sometimes draws from stock when it should consider discard, and sometimes a random legal move.
- **Medium**: one tier **between** easy and **hard** / **expert** (e.g. swap/dump thresholds and a lighter finisher model than `hard`).
- **Hard** and **Expert** share a “smart” line that evaluates swaps and dumps with estimated unknown-card EV, finisher risk, and column-clear bonuses. **Expert** extends **hard** with, among other things: tighter discard-vs-deck choice; multiset-based **probability** and **variance** for hidden cells; extra weight on **not** breaking a good column setup; and more careful **end-of-round** dump pressure when a lot of points are **already face-up** (visible “bad” hands).

(Implementation lives in `selectAiSkyjo` in `src/games/skyjo/index.ts`.)

## Other games: shell-timed AI, but difficulty is not used in the module

The shell’s `useEffect` hooks call `selectAiAction` for several titles, but the modules do **not** read `context.difficulty` (they `void` it or use `_context`). A fixed **`{ difficulty: 'medium' }`** is passed for **Crazy Eights** and **Uno**; for **Thirty-one**, **Euchre**, **Durak**, **Pinochle**, **Canasta**, and **Sequence Race**, the shell passes `difficultyForAiPlayer` from the session, but the **module ignores it** — behavior is the same regardless of the stored per-seat list.

| Game / module        | Shell auto-plays AI turns? | Uses `difficulty`? | Typical `selectAiAction` style |
|----------------------|----------------------------|--------------------|--------------------------------|
| **Crazy Eights**     | Yes                        | No (fixed `medium` in `App`) | Random legal play; random suit on 8. |
| **Uno**              | Yes                        | No (fixed `medium` in `App`) | Heuristic mix of play / draw / pass. |
| **Thirty-one**       | Yes                        | No                 | Knocks at high score; else random among legal. |
| **Euchre** / **Pinochle** | Yes                   | No                 | Random among legal card plays. |
| **Durak**            | Yes                        | No                 | Random attack; random beat; else take. |
| **Canasta**          | Yes                        | No                 | Draw two then random discard. |
| **Sequence Race**    | Yes                        | No                 | Random play or end turn. |

## Games with no (or no-op) `selectAiAction` in practice

- **War** — `selectAiAction` always returns `null`. You advance the skirmish with the table control yourself.
- **Blackjack**, **Baccarat**, **Poker (draw)**, **High-card duel** — `selectAiAction` is `null` or unused; the flow is **button- or step-driven** in the UI (e.g. dealer rules run inside the module on your actions).
- **Demo custom** — `selectAiAction` is `null`.

## Summary

- Only **Go Fish** and **Skyjo** both **show** the difficulty control **and** **implement** different playstyles per level.
- **Skyjo** is the only game with an **expert** policy that is **stricter** than **hard**; **Go Fish** maps **expert** to **hard**.
- Several other games have **timer-driven** AI in the browser, but that AI does **not** follow the easy/medium/hard/expert scale — it uses simple random or fixed heuristics, independent of the saved difficulty (and for most of those games, the toolbar does not even expose the control).

For architecture and how sessions store `aiPlayerConfig.difficulties`, see **`AGENTS.md`** in the repository root (AI section) and `src/App.tsx` (where `difficulty` is passed into `selectAiAction`).
