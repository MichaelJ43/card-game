# Table card motion (FLIP)

## Today’s behavior

- Cards are keyed by **`instanceId`** in [`TableView`](../../src/ui/TableView.tsx).
- New slots mount with a short CSS “arrive” animation (`tableView__cardSlot--enter` in [`TableView.css`](../../src/ui/TableView.css)).
- When a card **moves between zones**, React remounts the slot; the arrive animation fires again but there is **no** interpolated path from the old on-screen position to the new one.

## FLIP transition

- [`cardMotionFlip.ts`](../../src/ui/cardMotionFlip.ts) implements **First–Last–Invert–Play** using **`getBoundingClientRect`** on elements tagged with **`data-card-instance`** (set on each card slot in `TableView`).
- Before a **solo** table mutation, [`App`](../../src/App.tsx) captures rects on **`.app__tableMotionRoot`**, then applies state; a **`useLayoutEffect`** runs **`playCardLayoutFlip`** so cards **translate** from their previous screen position into place.
- **`prefers-reduced-motion: reduce`**: capture/animation is skipped; cards jump instantly.

## What is not covered yet

- **Multiplayer** client/host paths that apply actions without the same capture hook may not animate.
- **Motion blur / “smear”** frames are not implemented; FLIP only moves the card art. A follow-up could add a short filter or ghost layer during the tween.

## Files

| File | Role |
|------|------|
| [`src/ui/cardMotionFlip.ts`](../../src/ui/cardMotionFlip.ts) | `captureCardRects`, `playCardLayoutFlip`, `prefersReducedMotion` |
| [`src/ui/TableView.tsx`](../../src/ui/TableView.tsx) | `data-card-instance` on card slots |
| [`src/App.tsx`](../../src/App.tsx) | `tableViewRef`, flip capture around solo `dispatchAction` and AI `setSession` |
