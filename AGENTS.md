# Casper contributor guide

- Read `README.md` and `docs/product-brief.md` before changing game behavior.
- Preserve the distinction between proposed mechanics and implemented behavior.
- Run `npm test` and `npm run check` for gameplay changes. Run the local preview with `npm run dev`; `src/client/` is bundled into `dist/client/`; `public/` contains only static assets and headers and served by `src/server/worker.ts`. Read `docs/wiki/database.md` before changing data contracts, queries or migrations. `npm run dev:cloud` uses isolated staging D1 and `.dev.vars.staging`. Production migrations use the explicit `db:migrate:production` command. Never reuse production auth keys or copy player data into development.
- The selected concept is a Dragon Ball card arena. Read `docs/wiki/dragon-ball-arena.md` for stat evidence and `docs/wiki/arena-v3.md` for current mechanics and inventory boundaries.
- Runtime card stats and special profiles come from D1 via Drizzle and Zod, never a hardcoded JS catalog. Applied migrations are immutable; prepare new reviewed data migrations.
- Keep collectible asset identity, official card stats, and Casper-specific battle rules separate. Never infer combat strength from price or grading.
- Verify changed behavior, update `docs/wiki/` when behavior or architecture changes, and commit completed scoped work.
- Add recurring, concrete pitfalls to `memory.md` when discovered; do not use it as a progress log.
