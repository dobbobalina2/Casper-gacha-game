# D1 catalog and typed data layer

Implemented October 16, 2026. Supersedes the static catalog and Node proxy described in arena v3. Battle mechanics and pacing are unchanged.

## Runtime

A Cloudflare Worker serves the browser bundle, two read-only catalog endpoints, and the account endpoints documented separately. `GET /api/catalog` reads D1 using Drizzle, validates the assembled roster with Zod, and returns `{revision, cards}`. The browser validates that response again. There is no fallback to a JavaScript stat map or public JSON catalog. Missing or invalid catalog data returns 503 with a retry message.

The catalog uses four tables. Account, session and battle tables are documented in [Google login and battle saves](accounts-and-battles.md):

| Table | Contents |
| --- | --- |
| `card_definitions` | Verified official power, cost, combo power, family, type, color, provenance and display order |
| `special_attacks` | Casper bonuses, thresholds, energy modifiers, visual style, color and bounded audio notes; one per card definition |
| `collectibles` | Exact reference mint, source metadata, observation date and mapping qualification |
| `inventory_pages` | Normalized Collector Crypt page observations, including source, cursor, fetch time and expiry |

Foreign keys protect reference identities. Database checks reject invalid core stats. Zod additionally validates allowed visuals, safe URLs, audio bounds, unique identities, exact official source card numbers, and usable energy costs. Custom specials remain separate from official printed stats. Prices, grades, rarity and ownership are not inputs to battle strength.

`GET /api/inventory` accepts only the three Dragon Ball pool codes and a bounded opaque cursor. The Worker validates upstream responses and persists a 60-second cache capped at 20 pages. Expired observations are not served as live data; upstream failures remain retryable. Loading inventory never creates a playable definition. Catalog writes are not exposed. Authenticated battle saves have a separate API. Catalog admin changes use authenticated Wrangler migrations.

Saved battles include a SHA-256 revision and an immutable catalog snapshot. Account saves are validated by replaying legal actions on the server. Resuming uses that snapshot even after the catalog changes. Teams and audio preferences remain browser-local; account battles persist in D1. This is practice, not an authoritative multiplayer game server.

## Database and environments

Dedicated Cloudflare database: `casper-arena`, ID `ae7529d3-093b-47cf-9ffc-30c710e0941d`, account `5576346053b20f27278255cb8f602b12`. These identifiers are not credentials. Authentication stays in Wrangler's user configuration; no token belongs in the repo.

```sh
npm ci
npm run dev         # Build, migrate a local D1 copy, start localhost:4317
npm run dev:cloud   # Authenticated Cloudflare preview and real D1; requires Wrangler login
```

Local and cloud databases are separate. Local migrations do not change cloud data. `dev:cloud` also writes the bounded inventory cache to the remote Casper database. The cloud command uploads the Worker and static assets to an authenticated development preview, proxied through localhost; it does not publish a production website.

```sh
npm run db:migrate          # Apply pending migrations locally
npm run db:migrate:remote   # Apply reviewed migrations to Casper in Cloudflare
npm run db:inspect -- --command 'SELECT id, power, cost FROM card_definitions'
```

## Editing data

`db/seed/catalog.json` is the original import snapshot and test baseline. It is not read by the running application. Editing that file alone does not change the database. Existing migrations are immutable once applied.

For a catalog update, export or copy the current complete catalog into a review file, update sourced values, and generate a new data migration:

```sh
npm run catalog:prepare -- path/to/catalog.json db/migrations/0002_card_update.sql
npm run db:migrate
npm test
npm run check
```

The prepare command validates the entire input before writing anything, refuses to overwrite an existing output file, and uses Drizzle's column mappings to generate escaped upserts. It retains omitted existing cards: deletion requires a separate explicit reviewed migration. Use a fresh increasing migration prefix. Keep the complete roster order in the input. For schema changes, use `npm run db:generate`; if a manual data migration already occupies its generated numeric prefix, give the new schema migration a unique higher filename before applying. Wrangler records applied SQL filenames in `d1_migrations`; Drizzle's metadata describes schema snapshots.

Review the resulting SQL, verify provenance and mechanics, and then apply the same migration remotely. Schema changes belong in `src/db/schema.ts`; runtime and import validation lives in `src/contracts/`. If a catalog update changes balance, update the test fixture, wiki and balance report with that change. Do not silently regenerate the initial seed migration.

To roll back a data mistake, create a new validated migration restoring the previous values. Do not delete local state or drop the remote database as a rollback shortcut.

## Verification

`npm test` builds the bundles and runs combat, presentation, inventory, and isolated local D1 integration tests. D1 tests apply all migrations to a fresh database, compare every stat and special against the sourced seed, verify upsert idempotency, foreign keys, rollback, live API changes, revision changes, invalid-row rejection, quoted text, cache expiry and cache bounds. `npm run check` runs strict TypeScript checks for the backend, contracts, schema and import tooling plus frontend syntax checks. `npm run balance` reproduces the seed catalog baseline.

Official implementation references: [Drizzle D1 adapter](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1), [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/), [Zod validation](https://zod.dev/basics).

Verified on October 16: both migrations applied locally and to the dedicated cloud database; cloud reads returned eight definitions, eight specials, and eight collectible references. The authenticated cloud preview returned the validated catalog and loaded 24 live inventory items. In the browser, Kamehameha dealt 45 damage, the bot used Spirit Bomb, and turn 3 plus both used-special flags survived reload. All 35 tests, TypeScript/syntax checks, and the schema-drift check passed. The 1,296-pairing balance check remained within its existing pacing gates. Dependency audit reported zero vulnerabilities.

The local Worker with a remote D1 binding encountered a network connection failure in this environment. `dev:cloud` uses the working authenticated remote preview instead. Cloudflare Workers also require `redirect: 'manual'` to reject upstream redirects; Node's `redirect: 'error'` is unsupported there. The Worker integration test exercises this fetch path.
