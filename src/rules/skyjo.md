# Skyjo

Skyjo is a card game for several players. Everyone has their own **grid** of twelve cards (usually 3×4). Cards show numbers (often from **−2** up to **12**). Your goal is to finish rounds with a **low** sum on your grid. A **match** is many rounds; in this app the match usually ends when someone’s **cumulative** score reaches a target (often **100**); the player with the **lowest** total then wins the match.

## What you need to know first

1. Lower numbers on your grid are better; negative cards are great.
1. You do not know the value of face-down cards on your grid until they are flipped or swapped away.
1. Play moves in turns: draw from the deck or use the top of the **discard** pile, then place that card on your grid (or use the deck-only “dump and flip” rule—see below).
1. When **all** of your non-empty spaces are face-up, you may **call Skyjo** (end your round). Others get one more turn each; then everyone scores.

## Setup (typical)

1. Each player gets twelve cards on a grid, all face-down at first.
1. Two starting cards per player are turned face-up (which two varies by group; this app follows the module’s deal).
1. One starter card may start the discard pile; the rest form a draw pile.
1. The first player is often whoever has the highest sum on their two visible starters (this app uses that rule).

## Your turn (summary)

1. If you have **no** card waiting to be placed, choose either:
   1. **Draw** the top card of the deck (look at it), or
   1. **Take** the visible top card of the discard pile (if the rules allow—see optional house rule below).
1. If you **drew from the deck**, you may either:
   1. **Swap** that card onto your grid, replacing any one card (the replaced card goes to the discard), or
   1. **Dump** it: discard it and **flip one face-down** card on your grid face-up (you do not place the drawn card on the grid).
1. If you **took the discard**, you **must** place that card on your grid by swapping—you cannot dump it. You choose which grid position to replace.

## Columns of three matching cards

1. In many rule sets, if all **three** cards in a column show the **same** number and are face-up, that entire column is removed (those cards leave your grid and no longer count). This app clears matching triple columns when they occur.

## Calling Skyjo

1. When every real card on your grid is face-up, making a legal move can **trigger the end of the round** for you (sometimes called saying “Skyjo”).
1. Other players each get **one** more turn.
1. Then everyone scores the round: add the values of all cards still on your grid (empty slots usually count as 0).

## Finishing the round and the “double” rule

1. The player who ended the round compares their **round score** to everyone else’s.
1. If their round score is **not** the **lowest** (and is greater than zero), a common rule is that their score for that round is **doubled** as a penalty. This app applies that penalty when it applies.

## Match scoring

1. Each round, add your round score to your **running total**.
1. When at least one player’s total reaches the **match target** (see the table caption in the app), the match ends.
1. The **lowest** cumulative total wins the match (in this app’s default Skyjo manifest).

## Optional rules in this app (Rules → Options)

1. **Match target:** Change the cumulative score that can end the match (default is usually **100**).
1. **Discard only replaces face-up cards:** If enabled, you may **only** take the discard to **swap onto a face-up** grid card. Face-down spaces may only change via a **deck** draw (swap or dump-and-flip). This matches how some groups prefer to limit “fishing” with the discard.

## Playing in this app

1. Use **Start deal** / **New deal** after changing options so the next deal uses them.
1. Per-seat **AI difficulty** applies to computer players.
1. Follow the on-screen hints for draw, discard, swap, and dump-and-flip.
