# Thirty-One (Scat)

Simplified two-player practice table on a 32-card deck (7–A).

## Goal

1. Each turn you keep exactly three cards.
2. Your score is the best **single-suit** total using: A = 11, K/Q/J/10 = 10, other ranks at face value.
3. Only totals **31 or lower** count; higher busting totals are ignored for that suit.
4. Win the **match** by taking round points first to the table goal (default 5).

## Deal

1. Three cards to each player.
2. One starter card is turned face up to start the discard pile.
3. Remaining cards form the stock.

## Turns

1. Either **knock** to end the round immediately and compare hands, or
2. **Draw** the top stock card, add it to your hand (four cards), then **discard** one face up onto the discard pile, or
3. **Take** the top discard, add it to your hand, then **discard** a different card face up.

## Knock and scoring

1. When someone knocks, both hands are compared using the scoring rule under **Goal** above.
2. The higher valid score wins the round point.
3. If the stock runs out after a full turn, the round ends and hands are compared the same way.

## Notes

1. This build omits some pub rules (e.g. three-of-a-kind blitzes).
2. Player 0 is always the human seat; the shell runs simple AI for the opponent on supported games.
