# Go Fish

**Id:** `go-fish` · **Module:** `go-fish` · **Deck:** standard 52-card

Classic **Go Fish**: ask another player for a rank you hold; if they have any, you collect them; otherwise “go fish” from the stock. Completing a four-of-a-kind forms a **book**. The shell supports configurable **AI opponent count** (1–8) and per-seat **AI difficulty** when multiple AIs are enabled.

**Interaction:** choose a rank from your hand, then click an opponent’s hand or books pile to ask. **Pass** appears when the rules allow skipping your turn.

**Match:** optional in manifest; default play is table-focused with books and hand zones.

## See also

- **In-app rules** (modal text bundled in the app): [`src/rules/go-fish.md`](../src/rules/go-fish.md)
- **Project wiki:** [Go-Fish](https://github.com/MichaelJ43/card-game/wiki/Go-Fish)
