# Casper — Dragon Ball Card Arena

A playable three-versus-three practice arena using actual Collector Crypt collectible images and verified Fusion World card stats.

## Run

Requires Node.js 22 or newer. No package installation is needed.

```sh
npm run dev
```

Open http://127.0.0.1:4317. Set `PORT` to use a different local port.

```sh
npm test
npm run check
npm run balance
```

## Play

Choose three of eight fighters within a 14-cost budget. Select an attacker and a target, add optional combo support, then attack. Charge to restore energy and guard the next hit. Fighters rest for one of your turns after attacking or supporting; your last survivor recovers every turn. Energy recovers by 2 per turn. Knock out the opponent's team; at 60 total turns, remaining team HP decides the result.

Each fighter has a once-per-match special with its own tactical effect, animation, and synthesized sound. Specials cost extra energy and cannot use combo support. Use the header controls to mute or adjust volume. Reduced-motion preferences are respected.

Teams and the current match are saved in browser local storage. Reloading reconstructs the match from its actions. The bot follows the same combat rules.

## Data and scope

The roster is a dated, curated snapshot of real Collector Crypt inventory, matched by card number and family to official Bandai stats. Each card's detail panel includes its sources and collectible asset ID. Images are retained locally so gameplay does not depend on the live inventory API. The live collection browser loads additional Dragon Ball collectibles with cursor pagination. Only verified definitions are playable. Each card links to its exact Collector Crypt page to check purchase or offer options. Live gacha inventory is not proof of a direct sale listing; ownership is not verified.

This is practice access only: no in-app checkout, wallet connection, collectible transfers, prizes, accounts, or multiplayer. Printed card skills are not implemented. Casper's HP, damage, energy, and recovery rules are custom; this is not the official Fusion World game. Automated v3 matches take 14–34 total turns (median 21) across 1,296 ordered lineup pairings; human competitive balance still needs broader playtesting.

## Project map

- `src/shared/engine.ts`: deterministic combat, team validation, bot decisions, and replay recovery.
- `src/client/app.tsx`: lineup selection, battle controls, local persistence, and source details.
- `src/shared/specials.ts`: custom, character-specific special mechanics and presentation profiles.
- `public/collection.js` and `scripts/inventory.ts`: verified-definition matching and live inventory loading.
- `src/client/effects.ts`: cancellable combat animation and gesture-activated audio.
- `scripts/balance.ts`: reproducible all-lineup pacing comparison.
- `public/cards.json`: eight sourced card definitions with separate collectible references.
- `public/assets/`: local collectible images.
- `scripts/serve.ts`: localhost-only static server; serves `public/` and a bounded, read-only inventory route. Requires outbound HTTPS for live inventory.
- `tests/engine.test.ts`: combat, recovery, roster, and complete-match checks.
- [Product brief](docs/product-brief.md)
- [Project wiki](docs/wiki/README.md)
- [Implemented arena rules and verification](docs/wiki/arena-v3.md)
