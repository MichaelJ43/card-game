# Baccarat

**Id:** `baccarat` · **Module:** `baccarat` · **Deck:** standard 52-card

Punto banco–style **two-card** hands for “player” and “banker” seats. Totals are taken **modulo 10** (face cards and tens count as zero). You place a chip bet on **Player** or **Banker** (same payoff in this implementation; commission is not modeled).

**Chips / match:** bankrolls and round deltas feed the multi-round match — see [`src/games/baccarat/baccarat.yaml`](../../src/games/baccarat/baccarat.yaml).

**Also see:** [Mini Baccarat](mini-baccarat.md) (same engine).

## See also

- **In-app rules** (modal text bundled in the app): [`src/rules/baccarat.md`](../../src/rules/baccarat.md)
- **Wikipedia:** [Baccarat](https://en.wikipedia.org/wiki/Baccarat)
