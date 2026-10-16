# Casper — Dragon Ball Card Arena

A React and TypeScript reconstruction of the original three-versus-three practice arena, using the historical roster and verified Fusion World card stats.

## Run

Requires Node.js 22 or newer. Install dependencies with `npm ci` before running.

```sh
npm run dev
```

Open http://127.0.0.1:4317. Set `PORT` to use a different local port.

```sh
npm test
npm run check
```

## Play

Choose three of six fighters within a 14-cost budget. Select an attacker and a target, add optional combo support, then attack. Charge to restore energy and guard the next hit. Fighters rest for one of your turns after attacking or supporting. Knock out the opponent's team; at 60 total turns, remaining team HP decides the result.

Teams and the current match are saved in browser local storage. Reloading reconstructs the match from its actions. The bot follows the same combat rules.

## Data and scope

The roster is a dated, curated snapshot of real Collector Crypt inventory, matched by card number and family to official Bandai stats. Each card's detail panel includes its sources and collectible asset ID. Images are retained locally so gameplay does not depend on the live inventory API. Card availability and ownership are not checked in real time.

This is practice access only: no purchases, wallet connection, collectible transfers, prizes, accounts, or multiplayer. Printed card skills are not implemented. Casper's HP, damage, energy, and recovery rules are custom; this is not the official Fusion World game. Balance and match duration still need broader playtesting.

## Project map

- `src/shared/engine.ts`: deterministic v1 combat, team validation, bot decisions, and replay recovery.
- `src/client/`: typed React lobby, battle controls, and local persistence.
- `public/cards.json`: six sourced card definitions with separate collectible references.
- `public/assets/`: collectible images, under 1 MB combined.
- `scripts/serve.ts`: localhost-only static server; exposes only `public/`.
- `tests/engine.test.ts`: combat, recovery, roster, replay, and complete-match checks.
- [Product brief](docs/product-brief.md)
- [Project wiki](docs/wiki/README.md)
- [Implemented arena rules and verification](docs/wiki/arena-v1.md)
