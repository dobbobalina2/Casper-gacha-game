# Product brief

## Confirmed direction

- Project: Casper.
- Game concept: Card Arena.
- Collection: Dragon Ball, using actual Collector Crypt collectibles through their API.
- Investigate the cards' existing gameplay stats as the basis for combat.

## Proposed first playable

Three fighters per side in a short turn-based match against a bot. Players choose when to attack, commit a supporting card to a combo, or recover energy. Target two to three minutes per match, subject to playtesting.

Use verified official power, combo power, and cost as inputs. Casper's energy economy, damage calculation, victory condition, and support cooldowns are custom rules still to design. Avoid automatic wins from simply selecting the highest printed power; test a team cost budget and meaningful costs for supporting attacks.

Start with a small, verified Fusion World roster. This is a recommendation based on the inventory sample, not a decision to support every Dragon Ball card family. See [stat research](wiki/dragon-ball-arena.md).

Practice cards can represent real catalog entries without granting ownership; label that mode clearly. Actual collection-based play must verify holdings before team selection. Ownership verification has not been implemented.

## Data responsibilities

- Collector Crypt: collectible identity, images, inventory, and eventual acquisition and ownership integration.
- Official card catalog: game family, card number, type, printed stats, and abilities.
- Casper: explicitly versioned arena rules and any ability adaptations.

Keep these records separate. Collectible grade, price, and gacha prize tier do not set combat power. Do not guess stats when a match is ambiguous. A collectible asset and its card definition are distinct identities; multiple physical copies may share one definition.

## Open design decisions

- Exact turn sequence, energy rules, damage calculation, and victory condition.
- Team budget and duplicate-card policy.
- Which printed abilities can be adapted coherently to three-card play.
- Practice access and how verified ownership affects competitive access.
- Multiplayer and pack purchasing scope after the battle prototype.

## Proposed first-playable checks

- Every playable card has a verified family, number, type, and stat source.
- Unsupported cards and energy markers cannot silently become fighters.
- Players can complete a bot match with understandable legal moves and a visible result.
- The same battle state and actions resolve consistently.
- Practice access never implies ownership or transfers a collectible.

## Current status

Concept and collection selected. Twelve Dragon Ball inventory records inspected; one card definition matched to official stats. No application, battle engine, authenticated integration, or deployment exists yet.
