# Sequence race (Skip-Bo–style)

Building-race practice on a custom 112-card deck: twelve ranks (1–12) with eight copies each, plus eight **Wild** cards. This build avoids a trademarked name; rules are a loose homage, not a licensed ruleset.

## Goal

1. Be the first player to **empty your hand** to win the round (stock may still contain cards).
2. Default match is first to **3** round wins.

## Building piles

1. There are **four** shared build piles.
2. Each pile shows the **next value** it will accept, starting at **1** for all piles at the beginning of a hand.
3. After you play a matching value on a pile, that pile’s next value becomes the previous value plus one, wrapping **12 → 1**.
4. A **Wild** may be played on any pile; it counts as the pile’s current needed value for advancement.

## Turns

1. On your turn you may play **one or more** legal cards from your hand; each play is a separate action in the UI.
2. When you are done playing for the turn, choose **End turn (draw to five)** to draw from stock until you hold five cards (or stock runs out), then play passes to the opponent.
3. Opening deal gives five cards to each player.

## Notes

1. Played cards are stacked in a shared **waste** zone for visibility; only pile “next values” drive legality.
2. Configurable AI opponent count applies (default one AI).
