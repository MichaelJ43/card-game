# Shell UI design

Conventions for the **app chrome** around the table: header toolbar, dialogs that reuse shell styles, and the **Online play** (`MultiplayerPanel`) block. Implementation lives primarily in [`src/App.css`](../src/App.css); the shell is [`src/App.tsx`](../src/App.tsx).

## Toolbar buttons (header)

Secondary actions in the header (e.g. **Rules**, **New deal**, **End game**, AI difficulty controls) use:

- `app__btnSecondary` — base secondary button (border, transparent fill, theme text color).
- `app__btnToolbar` — toolbar sizing: `min-height: 2.25rem`, slightly tighter horizontal padding than the default `app__btnSecondary` alone.

**Pattern:** combine both classes on `<button>` elements:

```html
<button type="button" class="app__btnSecondary app__btnToolbar">Rules</button>
```

Primary actions use `app__btnPrimary` (e.g. **Next round**).

Theme tokens used by buttons and inputs: `var(--border)`, `var(--bg)`, `var(--text-h)`, `var(--accent-bg)` / `var(--accent-border)` where applicable (see `index.css` for root definitions).

## Multiplayer panel — compact row (table active)

When a deal is on the table, host and client see a **compact** strip inside `.multiplayerPanel__compact`.

**Layout**

- Row: `.multiplayerPanel__compactRow.multiplayerPanel__compactRow--split`
- **Lead** (left): `.multiplayerPanel__compactLead` — hosting/joined copy and room code (`flex: 1 1 …`, grows, truncates).
- **Tail** (right): `.multiplayerPanel__compactTail` — inline name editor (`Name` + input + **Save**), **Open chat**, and **Close room** / **Leave room**.
- The tail uses **`margin-left: auto`** so the name + actions stay **right-aligned** on the row (and align to the end of the line when the row wraps on narrow widths).

**Buttons**

All actions in this strip (including **Save** on the name field) use **`app__btnSecondary app__btnToolbar`** so they match the header toolbar.

**Name field**

The inline display-name input uses theme-aligned borders/background (`--border`, `--bg`, `--text-h`) and `min-height: 2.25rem` to line up visually with toolbar buttons. Classes: `.multiplayerPanel__nameplateInline*` in `App.css`.

## Multiplayer — lobby (no table yet)

**Host game** and **Join** submit use the same **`app__btnSecondary app__btnToolbar`** pair for consistency with the header.

## Expanded hosting / client (room open, no table)

**Close room** / **Leave room** in the non-compact blocks also use **`app__btnSecondary app__btnToolbar`**.

**Open chat** (compact and expanded multiplayer rows) uses the same button classes. It is available whenever you are in a room (host or joined client); it stays disabled only while **spectating**. Behavior of the chat window and main-window toasts is documented in [`multiplayer-chat.md`](multiplayer-chat.md).

## When you change something

1. Prefer reusing **`app__btnSecondary` + `app__btnToolbar`** for new shell-adjacent buttons instead of one-off panel button styles.
2. If you add another “lead + actions” row, mirror **`.multiplayerPanel__compactRow--split`** / **`.multiplayerPanel__compactTail`** (`margin-left: auto`) so actions stay right-aligned.
3. Update this doc when introducing new shared patterns or tokens.
