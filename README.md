# Casper — Dragon Ball Card Arena

A playable three-versus-three practice arena using actual Collector Crypt collectible images and verified Fusion World card stats.

Play the [public demo](https://casper-gacha-game.jfkiii.workers.dev). Guest practice is live, and production Google login is configured. See the [deployment runbook](docs/wiki/deployment.md).

## Run

Requires Node.js 22 or newer. Install dependencies first; the local database persists in `.wrangler/state/`.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4317. Use `npm run dev:cloud` for the real Cloudflare D1 database through an authenticated Cloudflare preview. This requires Wrangler login; it does not deploy the site. Set the port in `wrangler.jsonc`.

```sh
npm test
npm run check
npm run balance
```

## Play

Choose three of eight fighters within a 14-cost budget. Select an attacker and a target, add optional combo support, then attack. Charge to restore energy and guard the next hit. Fighters rest for one of your turns after attacking or supporting; your last survivor recovers every turn. Energy recovers by 2 per turn. Knock out the opponent's team; at 60 total turns, remaining team HP decides the result.

Each fighter has a once-per-match special with its own tactical effect, animation, and synthesized sound. Specials cost extra energy and cannot use combo support. Use the header controls to mute or adjust volume. Reduced-motion preferences are respected.

Sign in with Google to autosave every move to your account. Open **My battles** to resume an unfinished match or revisit a completed result. Browser backups retain pending saves when a connection fails; use **↻ Save** to retry. Guests can play and resume on the same browser, then explicitly import their latest guest battle after signing in. Saved matches retain their original card stats. The bot follows the same combat rules.

See [Google login and battle saves](docs/wiki/accounts-and-battles.md) for credentials, the exact callback URI, and persistence behavior.

## Data and scope

The roster is stored in Cloudflare D1, accessed through Drizzle ORM, and validated with Zod. It is a dated, curated snapshot of real Collector Crypt inventory, matched by card number and family to official Bandai stats. Each card's detail panel includes its sources and collectible asset ID. Images are retained locally so gameplay does not depend on the live inventory API. The live collection browser loads additional Dragon Ball collectibles with cursor pagination. Only verified definitions are playable. Each card links to its exact Collector Crypt page to check purchase or offer options. Live gacha inventory is not proof of a direct sale listing; ownership is not verified.

This is practice access only: no in-app checkout, wallet connection, collectible transfers, prizes, or multiplayer. Printed card skills are not implemented. Casper's HP, damage, energy, and recovery rules are custom; this is not the official Fusion World game. Automated v3 matches take 14–34 total turns (median 21) across 1,296 ordered lineup pairings; human competitive balance still needs broader playtesting.

## Project map

- `src/shared/engine.ts`: deterministic combat, team validation, bot decisions, and replay recovery.
- `src/client/App.tsx`: lineup selection, battle controls, battle presentation, and source details.
- `src/client/account.ts` and `src/client/save-queue.ts`: Google sign-in, account-scoped backups, save retry, and battle history.
- `src/shared/specials.ts`: reads special profiles supplied by the database.
- `src/client/collection.ts` and `src/inventory.ts`: verified-definition matching and validated live inventory loading.
- `src/client/effects.ts`: cancellable combat animation and gesture-activated audio.
- `scripts/balance.ts`: reproducible all-lineup pacing comparison.
- `src/db/` and `src/contracts/`: typed Drizzle tables, catalog queries, and Zod validation.
- `db/migrations/`: versioned schema and catalog data; `db/seed/catalog.json` is the initial import/test baseline only.
- `public/assets/`: local collectible images.
- `src/worker.ts`: Cloudflare Worker with catalog, inventory, auth, and battle APIs; serves the browser bundle built from `src/client/`.
- `scripts/prepare-catalog.ts`: validates catalog imports and prepares reviewable SQL migrations.
- `tests/engine.test.ts`: combat, recovery, roster, and complete-match checks.
- [Product brief](docs/product-brief.md)
- [Database architecture and update workflow](docs/wiki/database.md)
- [Project wiki](docs/wiki/README.md)
- [Implemented arena rules and verification](docs/wiki/arena-v3.md)

React components use `.tsx`; shared rules, client services, server code, tests, and build tooling use strict `.ts`. Run `npm run check` to typecheck the full project.
