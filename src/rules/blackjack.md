# Blackjack

Blackjack (also called **21**) is a casino-style card game between **you** and the **dealer**. You try to get a hand total **as close to 21 as possible** without going **over** (busting). Face cards count as **10**; an ace counts as **1** or **11**, whichever is better for your hand without busting.

## Goal

1. Beat the dealer by having a **higher total ≤ 21**, or let the dealer **bust** while you stay ≤ 21.

## Round flow (this app)

1. **Bet** a legal amount using the chip buttons (limits and stacks are shown in the UI).
1. You and the dealer each receive **two** cards; one of the dealer’s cards stays hidden until you finish.
1. **Your turn:** take **Hit** (draw another card) or **Stand** (stop drawing).
1. If you go over **21**, you **bust** and lose the bet immediately.
1. If you stand, the dealer reveals the hidden card and **must draw** until reaching a standing rule (see below).
1. Compare totals: higher wins; equal totals are a **push** (tie, bet returned).

## Dealer rules (default vs option)

1. **Default in this app:** the dealer keeps hitting while their total is **below 17**, then stands (including on **soft 17**—e.g. ace + six).
1. **Optional (Rules → Options):** **Dealer hits soft 17** means if the dealer has **17** with an ace still counting as **11**, they take another card—slightly more favorable to the house.

## Blackjack (natural 21)

1. If your first two cards total **21**, you have a **blackjack**.
1. If the dealer also has blackjack, the hand is usually a **push**; if only you have it, you are typically paid **3:2** on your bet (this app uses integer payouts where noted).

## Match / chips (this app)

1. This blackjack variant can track **chip stacks** across hands until a **match target**; see the cumulative panel and Rules options for the goal.

## Playing in this app

1. Place bets with the custom action buttons; use **Next round** when a hand completes if the match continues.
