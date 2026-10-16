# Product brief

## User direction

- Project: Casper, a gacha game.
- Build a quick game around collectible collections.
- Pokémon or another collectible theme is under consideration.
- Use actual Collector Crypt collectibles through their API, as confirmed by the user.

## Proposed prototype scope

Current priority: decide what game Casper should be before choosing an implementation or purchase flow. The pack-opening proposal below is provisional, not a selected concept. Explore collection quests, short card battles, and an arcade with collectibles as possible directions.

A browser game with one Collector Crypt collection, a pack-opening reveal, rarity indicators, and a view of the player's verified holdings. Begin with real inventory browsing, then implement the chosen pack flow against the development environment before production transactions.

Collector Crypt is the source of collectible data and award results. Casper supplies the game interface. Local presentation state must not be treated as proof that a player owns a collectible. Any simulated preview must be explicitly labeled and kept separate from actual holdings.

Keep the collection data separate from the reveal and binder behavior so the initial theme can be changed without rewriting the game loop.

These are proposed defaults, not approved product requirements.

## Decisions before implementation

- Which collection and artwork should the first version use?
- Should purchases use the wallet-based API or the invoiced partner API? See [API research](wiki/collector-crypt.md).
- Is opening and collecting the whole game, or should collected items also be used in a playable challenge?
- Which partner API access is available for the selected integration?

Public inventory access has been verified. Authentication, purchase, award, and ownership flows still need implementation and verification.

## Proposed first-playable acceptance criteria

- A player can browse real inventory and complete the selected development pack flow.
- Displayed odds and award results come from the selected Collector Crypt machine.
- The collection view reflects verified holdings, keyed by asset identity.
- Refreshing during a pack opening resumes the existing operation without creating another purchase.
- The pack-opening and binder controls work on mobile and desktop.
- Development transactions and simulated previews are clearly identified in the interface.

## Current implementation

No application code yet. Collector Crypt is the confirmed data source. Technology stack, mechanics, integration mode, and release destination remain open.
