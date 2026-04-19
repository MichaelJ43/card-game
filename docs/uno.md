# Uno

**Id:** `uno` · **Module:** `uno` · **Deck:** `uno` (108 cards in [`src/decks/uno.yaml`](../src/decks/uno.yaml))

Uno-style shedding: match the **current color** or the **face** of the top discard, or play **Wild** / **Wild +4**. Action cards (**Skip**, **Reverse**, **Draw two**) follow the usual flow; two-player reverses/skips behave like common house rules (opponent may lose a turn).

**Draw:** if you have no legal play, draw one card; you may play that card or end your turn, as implemented in the action list.

**Match:** first to **500** points from round wins (opponents’ remaining cards scored) — see [`src/games/uno/uno.yaml`](../src/games/uno/uno.yaml).

**Players:** 2–4 (human + AIs).

*Uno® is a trademark of Mattel. This is an independent fan-style implementation for the table engine.*
