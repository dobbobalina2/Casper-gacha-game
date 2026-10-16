# Product brief

## User direction

- Project: Casper, a gacha game.
- Build a quick game around collectible collections.
- Pokémon or another collectible theme is under consideration.
- Clarify whether “collector crypt” means an integration with Collector Crypt.

## Proposed prototype scope

A browser game with one small collection, a pack-opening reveal, rarity indicators, and a binder showing collected items and duplicates. Use demo credits and placeholder collectible data while the theme and integration are decided. Save prototype progress locally.

Keep the collection data separate from the reveal and binder behavior so the initial theme can be changed without rewriting the game loop.

These are proposed defaults, not approved product requirements.

## Decisions before implementation

- Is the game using actual Collector Crypt collectibles or a standalone catalog?
- Which collection and artwork should the first version use?
- Is opening and collecting the whole game, or should collected items also be used in a playable challenge?
- Does the first version need accounts, wallets, or shared progress?

Any live integration needs its actual interface and collectible data verified before implementation.

## Proposed first-playable acceptance criteria

- A player can open a demo pack and see the result.
- Published demo rarity probabilities match the selection logic.
- Results appear in the binder, including duplicate counts.
- Progress survives a page refresh.
- The pack-opening and binder controls work on mobile and desktop.
- Demo items and credits are clearly identified in the interface.

## Current implementation

None. Technology stack, mechanics, data source, and release destination remain open.
