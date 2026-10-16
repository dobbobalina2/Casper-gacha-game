# Casper contributor guide

- Read `README.md` and `docs/product-brief.md` before changing game behavior.
- Preserve the distinction between proposed mechanics and implemented behavior.
- Run `npm test` and `npm run check` for gameplay changes. Run the local preview with `npm run dev`; static files come from `public/`; `/api/inventory` is a bounded read-only Collector Crypt proxy.
- The selected concept is a Dragon Ball card arena. Read `docs/wiki/dragon-ball-arena.md` for stat evidence and `docs/wiki/arena-v3.md` for current mechanics and inventory boundaries.
- Keep collectible asset identity, official card stats, and Casper-specific battle rules separate. Never infer combat strength from price or grading.
- Verify changed behavior, update `docs/wiki/` when behavior or architecture changes, and commit completed scoped work.
- Add recurring, concrete pitfalls to `memory.md` when discovered; do not use it as a progress log.
