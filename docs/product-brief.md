# Product brief

## Confirmed direction

- Project: Casper.
- Game concept: Card Arena.
- Collection: Dragon Ball, using actual Collector Crypt collectibles through their API.
- Investigate the cards' existing gameplay stats as the basis for combat.

## First playable

Three fighters per side in a short turn-based match against a bot. Players choose when to attack, commit a supporting card to a combo, or recover energy. Target two to three minutes per match, subject to playtesting.

The implemented v3 uses verified official power, combo power, and cost as inputs, with custom energy, damage, victory, and recovery rules. See [the exact rules and verification](wiki/arena-v3.md). A team cost budget and support costs are implemented; competitive balance is not established.

The current roster contains eight verified Fusion World definitions. Other Dragon Ball card families are not supported. See [stat research](wiki/dragon-ball-arena.md).

Practice cards represent real catalog entries without granting ownership, and the interface labels this mode explicitly. Actual collection-based play must verify holdings before team selection. Ownership verification has not been implemented.

## Data responsibilities

- Collector Crypt: collectible identity, images, inventory, and eventual acquisition and ownership integration.
- Official card catalog: game family, card number, type, printed stats, and abilities.
- Casper: explicitly versioned arena rules and any ability adaptations.

Keep these records separate. Collectible grade, price, and gacha prize tier do not set combat power. Do not guess stats when a match is ambiguous. A collectible asset and its card definition are distinct identities; multiple physical copies may share one definition.

## Open design decisions

- Further lineup and initiative balance after the v2 pacing pass.
- Which additional printed abilities can be adapted after the custom v3 signature moves.
- Practice access and how verified ownership affects competitive access.
- Multiplayer and pack purchasing scope after the battle prototype.

## Proposed first-playable checks

- Every playable card has a verified family, number, type, and stat source.
- Unsupported cards and energy markers cannot silently become fighters.
- Players can complete a bot match with understandable legal moves and a visible result.
- The same battle state and actions resolve consistently.
- Practice access never implies ownership or transfers a collectible.

## Current status

A local browser prototype implements lineup selection, bot battles, card source details, rematches, and replay-based refresh recovery. Eight card definitions were matched to official stats using bounded inventory samples. The lobby also has a paginated live inventory browser and external links to exact collectible pages. There is no authenticated ownership integration, pack purchasing, multiplayer, or hosted deployment.
