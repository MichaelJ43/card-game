# Table AI: difficulties and per-game behavior

The shell moves AI opponents on your behalf by calling each game’s `selectAiAction` with a `SelectAiContext` (see `src/core/aiContext.ts` and `GameModule` in `src/core/gameModule.ts`).

- **`SelectAiContext.difficulty`** is one of **`easy`**, **`medium`**, **`hard`**, or **`expert`**.
- **`SelectAiContext.matchCumulativeScores`** and **`matchTargetScore`** are passed for **Skyjo** match play (finisher doubling).

## Toolbar: per-seat difficulty

The **Game** toolbar shows a difficulty control for every game in `gameSupportsPerSeatAiDifficulty` (`src/session/playerConfig.ts`): **Go Fish**, **Skyjo**, **Crazy Eights**, **Switch**, **Uno**, **Thirty-one**, **Euchre**, **Durak**, **Pinochle**, **Canasta**, and **Sequence Race**. The shell passes the chosen value into `selectAiAction` for those titles (see `src/App.tsx`).

## What each level means (global)

| Level     | Role |
|-----------|------|
| **Easy**  | Weaker play, more random mistakes and suboptimal moves. |
| **Medium** | Baseline heuristics with occasional randomness. |
| **Hard**   | Strong, “by the book” moves: maximize score / minimize risk with little randomness. |
| **Expert** | Often **hard**-like, but adds **advanced or non-obvious** choices: second-best plays for unpredictability, partner/position tactics, holding key cards, or intentional “slow” or risky lines. |

---

## Go Fish

- **Medium**: uniform random among legal `goFishAsk` actions.
- **Hard**: score asks with a small heuristic (favor ranks you already hold, larger opponent hands), pick uniformly among top scores.
- **Easy**: often picks **low**-scoring asks; sometimes fully random.
- **Expert**: uses a **stronger** score (bonuses for being **one away from a book**, penalties for asking players with only 0–1 cards, extra weight to fish large hands) and about **12%** of the time takes the **second**-best ask so responses are not always predictable.

---

## Skyjo

(Implementation in `selectAiSkyjo` in `src/games/skyjo/index.ts`.)

- **Easy**: more randomness, occasional poor draw/discard and random move noise.
- **Medium**: between easy and the smart line, lighter finisher model.
- **Hard** / **Expert**: value draws/swap/dump with unknown-card **EV**, finisher / match **double** risk, and column-triple weighting. **Expert** adds: **variance** on face-down cells, column **pair** pressure, stricter **discard vs deck**, and more caution when a lot of points are already **face-up** and when ending the round.

---

## Uno

- **Easy** / **Medium**: the older random mix; easy passes more after drawing.
- **Hard**: **scores** `unoPlay` actions (favor your strong colors, action cards when the next hand is tiny, play over pass after draw more reliably).
- **Expert**: as **hard**, but can **refuse to burn a wild** when a cheap number play exists, and rarely takes the second-ranked play for variety.

## Crazy Eights & Switch (same `crazy-eights` module)

- **Easy**: may **draw** even with a legal play; else random play; randomish 8 suit.
- **Medium**: random legal play; 8 suit from a simple rule.
- **Hard**: avoid drawing when possible; **shed** high non-8s first, **save 8s**; on 8, call the **suit** you hold the most of.
- **Expert**: as **hard**, plus sometimes **holds** an 8, and with low probability a **less obvious** 8 **suit**.

---

## Thirty-one

Uses the **known** top **stock** card in simulation for hard+expert (full table state in single-player is available to the module).

- **Easy**: very loose knock thresholds and **random** draw/swap.
- **Medium**: knocks at **28+** with a bit of noise; ~55% pick the **best** simulated hand after draw/take.
- **Hard**: knocks at **27+** (always at **29+**); always picks the action that **maximizes** single-suit total after the swap, when the top stock card is known.
- **Expert**: as **hard**, but with slightly **higher** knock standards on medium totals, **slow-play** (skip knock) a small fraction of the time, and a rare **intentional** suboptimal swap.

---

## Euchre (4 players)

- **Easy** / **Medium**: a lot of **random** among legal cards; medium is slightly tighter.
- **Hard**: on the **last** card to the trick, win with the **cheapest** winner if possible, else **dump** lowest; on **lead**, prefer a **low non-trump** if you have one.
- **Expert**: same core as **hard**, but may **throw off** to a partner who already has the trick won, and rarely picks a **second**-best winning card to stay ambiguous.

---

## Pinochle (2 players)

No partner: heads-up only.

- **Easy** / **Medium**: more random; medium a bit less.
- **Hard** / **Expert**: on the **second** (final) card to a trick, take the trick with **minimum** power if you can, else **dump** lowest; on **lead**, low **non-trump** when possible. **Expert** sometimes plays the **next**-cheapest winner.

---

## Durak (2 players)

- **Easy** / **Medium**: more random **attack** card; defender sometimes picks a **random** beating card.
- **Hard**: as attacker with a follow-up, prefer **reusing the attack rank**; otherwise play **lowest** rank. Defender beats with the **lowest** legal card; **expert** occasionally **takes** the stack even when a beat exists (8%) to **reshape** the hand.

---

## Canasta (practice)

- **Easy** / **Medium**: often **random** discard; medium less so.
- **Hard**: discards the **highest** penalty card (A/K/Q/10 vs low numbers, joker worst).
- **Expert**: as **hard**, but **holds** pairs (same template) much longer when it would break a **duplicate**; rarely discards the **second**-worst card.

---

## Sequence Race

- **Easy** / **Medium**: random **play** when any legal.
- **Hard** / **Expert**: **score** each play (prefer advancing piles that are closer to 12, favor higher “need” numbers slightly). **Expert** adds a little noise and sometimes the **second**-best scored play to avoid a fixed pattern, and rare **misplay** down-weighting.

---

## Games with no `selectAiAction` in practice

- **War** — `selectAiAction` is `null`; you press **Step** yourself.
- **Blackjack**, **Baccarat**, **Poker (draw)**, **High-card duel** — `selectAiAction` is `null` or unused; the UI drives betting and play.
- **Demo custom** — `selectAiAction` is `null`.

For architecture, see **`AGENTS.md`** and `src/App.tsx` (where `difficulty` is passed into `selectAiAction`).
