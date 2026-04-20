# Euchre (simplified)

Four-player free-for-all trick-taking on a 24-card deck (9–A). Partnership and bidding are **not** modeled; this is a trick-race practice table.

## Goal

1. Play five tricks.
2. Each trick goes to the player who played the **winning card**.
3. **Trump** is fixed for the hand from a turned-up card after the deal (left/right bowers are **not** special in this build).
4. Win the **match** by cumulative tricks to the goal (default 10).

## Card strength

1. Within a suit, high to low: A, K, Q, J, 10, 9.
2. Any trump beats any non-trump.
3. If no trump was played, the highest card **of the suit that was led** wins.

## Follow rules

1. If you have any card of the **led suit**, you must play a card of that suit.
2. Otherwise you may play any card.

## Deal and play

1. Five cards each; one card is turned face up as the trump indicator (trump suit only—card is out of play).
2. Leftover stock is not used.
3. Player 1 leads the first trick; trick winner leads the next.

## Notes

1. AI count is fixed by the manifest (three computer opponents) so the table always has four seats.
2. Scores shown in the match panel are **tricks won** this hand, added to your running total.
