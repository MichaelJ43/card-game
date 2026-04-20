# Blackjack

**Id:** `blackjack` · **Module:** `blackjack` · **Deck:** standard 52-card

Heads-up **blackjack** vs a dealer seat: place a bet, receive two cards, then **Hit** or **Stand**. Dealer hits to a fixed threshold. Natural blackjacks pay 3:2 where implemented; bust loses the bet.

**Chips / match:** cumulative scores represent **chip stacks** (`scoringMode: chips`). Default manifest uses a starting stack and a target chip total to win the match — see [`src/games/blackjack/blackjack.yaml`](../src/games/blackjack/blackjack.yaml).

**Also see:** [Casino Blackjack](casino-blackjack.md) (same module, different defaults).

## See also

- **In-app rules** (modal text bundled in the app): [`src/rules/blackjack.md`](../src/rules/blackjack.md)
- **Project wiki:** [Blackjack](https://github.com/MichaelJ43/card-game/wiki/Blackjack)
