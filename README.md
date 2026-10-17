# Casper — Dragon Ball Card Arena

A React and TypeScript three-versus-three practice arena using actual Collector Crypt collectible images and verified Fusion World card stats.

Play the [public demo](https://casper-gacha-game.jfkiii.workers.dev). Guest practice is live, and production Google login is configured. See the [deployment runbook](docs/wiki/deployment.md).

## Run

Requires Node.js 22 or newer. Install dependencies first; the local database persists in `.wrangler/state/`.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4317. Use `npm run dev:cloud` for the isolated staging D1 database through an authenticated Cloudflare preview. This requires Wrangler login; it does not deploy the site. Set the port in `wrangler.jsonc`.

```sh
npm test
npm run check
npm run balance
```

## Play

Choose three of eight fighters within a 14-cost budget. Select an attacker and a target, add optional combo support, then attack. Charge to restore energy and guard the next hit. Fighters rest for one of your turns after attacking or supporting; your last survivor recovers every turn. Energy recovers by 2 per turn. Knock out the opponent's team; at 60 total turns, remaining team HP decides the result.

Each fighter has a once-per-match special with its own tactical effect, animation, and synthesized sound. Specials cost extra energy and cannot use combo support. Use the header controls to mute or adjust volume. Reduced-motion preferences are respected.

Sign in with Google to autosave every move to your account. Open **My battles** to resume an unfinished match or revisit a completed result. Browser backups retain pending saves when a connection fails; use **↻ Save** to retry. Rate-limited saves wait one minute and automatically retry the latest moves. Accounts can store up to 200 cloud battles; existing saves remain resumable at the cap. Guests can play and resume on the same browser, then explicitly import their latest guest battle after signing in. Saved matches retain their original card stats. The bot follows the same combat rules.

See [Google login and battle saves](docs/wiki/accounts-and-battles.md) for credentials, the exact callback URI, and persistence behavior.

## Data and scope

The roster is stored in Cloudflare D1, accessed through Drizzle ORM, and validated with Zod. It is a dated, curated snapshot of real Collector Crypt inventory, matched by card number and family to official Bandai stats. Each card's detail panel includes its sources and collectible asset ID. Images are retained locally so gameplay does not depend on the live inventory API. The live collection browser loads additional Dragon Ball collectibles with cursor pagination. Only verified definitions are playable. Each card links to its exact Collector Crypt page to check purchase or offer options. Live gacha inventory is not proof of a direct sale listing; ownership is not verified.

This is practice access only: no in-app checkout, wallet connection, collectible transfers, prizes, or multiplayer. Printed card skills are not implemented. Casper's HP, damage, energy, and recovery rules are custom; this is not the official Fusion World game. Automated v3 matches take 14–34 total turns (median 21) across 1,296 ordered lineup pairings; human competitive balance still needs broader playtesting.

## Architecture

React components in `.tsx` files render the lobby, battle arena, collection browser, and dialogs. `useArena.ts` coordinates immutable battle transitions, local/cloud persistence, bot scheduling, and cancellable effects. UI state such as fighter selection stays separate from match state. The battle log remains visible beside the controls. The shared TypeScript engine is independent of React and is used by both the browser and the Worker for replay validation.

The account service publishes typed snapshots instead of rendering HTML. React owns its controls and history dialog; the service owns durable saves and retry rules. Effects use DOM refs for Web Animations and Web Audio and dispose their listeners on unmount. All application, test, and build source is strict TypeScript (`.ts`/`.tsx`); only generated browser/Worker bundles are JavaScript.

Use `npm run format` to format source and tests, and `npm run format:check` to check formatting. `npm run check` typechecks the complete application.

## Project map

- `src/shared/engine.ts`: deterministic combat, team validation, bot decisions, and replay recovery.
- `src/client/App.tsx`: app composition, catalog loading, inventory, and account integration.
- `src/client/components/`: typed React lobby, battle arena, collection, and dialog components.
- `src/client/useArena.ts`: match state, move locking, bot timing, persistence, and animation lifecycle.
- `src/client/account.ts` and `src/client/save-queue.ts`: Google sign-in, account-scoped backups, save retry, and battle history.
- `src/shared/specials.ts`: reads special profiles supplied by the database.
- `src/client/collection.ts` and `src/server/inventory.ts`: verified-definition matching and validated live inventory loading.
- `src/client/effects.ts`: cancellable combat animation and gesture-activated audio.
- `scripts/balance.ts`: reproducible all-lineup pacing comparison.
- `src/server/db/` and `src/shared/contracts/`: typed Drizzle tables, catalog queries, and Zod validation.
- `db/migrations/`: versioned schema and catalog data; `db/seed/catalog.json` is the initial import/test baseline only.
- `public/assets/`: local collectible images.
- `src/server/worker.ts`: Cloudflare Worker with catalog, inventory, auth, and battle APIs; serves the browser bundle built from `src/client/`. Only images and `_headers` are copied from `public/`.
- `scripts/prepare-catalog.ts`: validates catalog imports and prepares reviewable SQL migrations.
- `tests/engine.test.ts`: combat, recovery, roster, and complete-match checks.
- [Product brief](docs/product-brief.md)
- [Database architecture and update workflow](docs/wiki/database.md)
- [Project wiki](docs/wiki/README.md)
- [Implemented arena rules and verification](docs/wiki/arena-v3.md)
