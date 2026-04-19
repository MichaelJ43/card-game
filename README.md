# Card table

A **browser-only** card table built with **React**, **TypeScript**, and **Vite**. Games load **YAML** deck definitions and per-game manifests; each title is implemented as a TypeScript **game module** that drives table zones, legal actions, and optional **multi-round match** scoring (points or chip-style bankrolls).

## Requirements

- **Node.js** (20+ or current LTS recommended)
- **npm** (comes with Node)

## Run locally

Install dependencies:

```bash
npm install
```

Start the dev server (hot reload):

```bash
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

Production build and local preview of the built assets:

```bash
npm run build
npm run preview
```

Lint:

```bash
npm run lint
```

## Available games

Pick a game from the in-app **Game** menu. Each row links to a short note in [`docs/`](docs/).

| Game id | Description | Doc |
|--------|-------------|-----|
| `war` | Compare high cards; winner takes the trick. | [War](docs/war.md) |
| `demo-custom` | Simple duel using the small **example-custom** deck. | [Custom deck duel](docs/demo-custom.md) |
| `go-fish` | Ask opponents for ranks and collect books (configurable AI count). | [Go Fish](docs/go-fish.md) |
| `skyjo` | Flip/swap/dump on a numbered Skyjo deck; match play to a target score. | [Skyjo](docs/skyjo.md) |
| `blackjack` | Heads-up blackjack vs dealer with chip match. | [Blackjack](docs/blackjack.md) |
| `casino-blackjack` | Same rules as blackjack; different default stacks / match target. | [Casino Blackjack](docs/casino-blackjack.md) |
| `baccarat` | Bet player or banker; two-card totals modulo 10. | [Baccarat](docs/baccarat.md) |
| `mini-baccarat` | Same engine as baccarat; tuned manifest defaults. | [Mini Baccarat](docs/mini-baccarat.md) |
| `crazy-eights` | Shed cards; match suit/rank or play an 8 and call suit. | [Crazy Eights](docs/crazy-eights.md) |
| `switch` | Same engine as Crazy Eights (alternate manifest). | [Switch](docs/switch.md) |
| `poker-draw` | Heads-up 5-card draw with ante and simplified showdown. | [Poker (5-card draw)](docs/poker-draw.md) |
| `heads-up-poker` | Same module as poker-draw; alternate match settings. | [Heads-up poker](docs/heads-up-poker.md) |
| `high-card-duel` | Higher single card wins the pot (5 or 10 chip bets). | [High-card duel](docs/high-card-duel.md) |
| `red-dog` | Same engine as high-card duel (alternate manifest). | [Red Dog](docs/red-dog.md) |
| `uno` | Uno-style shedding game on the custom **uno** deck (108 cards). | [Uno](docs/uno.md) |

## Repository layout (overview)

| Path | Role |
|------|------|
| [`src/decks/`](src/decks/) | Deck YAML (standard 52, Skyjo, Uno, examples). |
| [`src/games/<name>/`](src/games/) | Manifest YAML + `index.ts` game module per title or family. |
| [`src/core/`](src/core/) | Table model, deck parsing, match state, registry. |
| [`src/data/manifests.ts`](src/data/manifests.ts) | Wires game and deck ids to bundled YAML. |
| [`docs/`](docs/) | Per-game markdown notes (rules as implemented in-app). |

## Contributing

Add or change a game by extending the registry, deck, and module pattern used in `src/games/`. See the relevant file under [`docs/`](docs/) for behavior-specific notes.
