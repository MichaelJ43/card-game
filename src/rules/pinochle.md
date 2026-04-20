# Pinochle (two-player trick race)

Trick-taking practice using a **double** pinochle deck built from two copies of each 9–A in all four suits (48 cards total). Meld and partnership scoring are **not** implemented.

## Goal

1. Play **twelve** tricks (each player starts with twelve cards).
2. Each trick’s winner takes the trick and **leads** the next.
3. **Trump** is fixed from one turned card after the deal.
4. Win the **match** by cumulative tricks to the goal (default 40).

## Card strength

1. Within a suit: A, K, Q, J, 10, 9 (high to low)—this is a simplification of classic pinochle trick rankings.
2. Trump beats non-trump; among non-trump cards, only cards of the **led suit** can win.

## Follow rules

1. If you can follow suit, you must.
2. Otherwise you may play any card.

## Notes

1. The deck file defines a single 24-card template set; the module duplicates it to 48 physical cards at setup.
2. Configurable AI opponent count applies (default one AI).
