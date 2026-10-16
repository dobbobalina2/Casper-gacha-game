# Dragon Ball arena research

Initial research checked October 16, 2026. The local prototype now implements [arena v1](arena-v1.md); the evidence below records the initial discovery.

## Inventory evidence

Read [12 records from the Dragon Ball 50 machine](https://gacha.collectorcrypt.com/api/getNfts?code=dragonball_50&limit=12). This is a bounded first-page sample, not a census or random sample of all inventory.

Names included Piccolo SB02-043, Broly FB06-120, Son Gohan FB01-140, and energy markers E-44, E-73, and E-70. Some names omit the separator in the card number or are truncated.

The returned attributes described category, year, insured value, vault, authentication, and grading. Neither these attributes nor `content.metadata` exposed structured power, cost, or combo power in this sample. This does not establish that every endpoint lacks such fields.

## Verified card-definition match

Collector Crypt returned:

- Name: `2025 #SB02-043 Piccolo Alternate`
- Description: `2025 #SB02-043 Piccolo Alternate Art SR`
- Asset: `HJy2FkuKyMvWHHEdV5whi2dDYrJhz4kKGXnNvdbESMV4`

[Bandai's official Piccolo SB02-043 entry](https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=SB02-043&p=_p2) identifies a green Fusion World Battle card with cost 4, two green specified cost, power 25,000, combo power 5,000, and Namekian/Planet Namek traits. Its attack ability interacts with drawing cards, a Leader's traits, and life.

The name and number establish a useful definition match. Exact alternate-art printing and the physical card image have not been visually verified. This is not a full inventory-to-catalog mapping.

## Implications for Casper

Official stats exist, but need a separate sourced mapping. Match game family and card number, then verify the card type and printing as needed. Character name alone is insufficient. Unresolved matches should remain unavailable for battle.

Recommended starting scope: a small Fusion World Battle-card roster, with power, cost, and combo power retained as sourced fields. Use Casper rules for a three-fighter arena. Printed abilities that depend on a full deck or Leader require explicit adaptations; do not claim the arena reproduces the official game.

Grade and market value remain collectible properties. Different graded copies of the same gameplay definition should have the same combat stats. Energy markers require a separate role or exclusion, not invented fighter stats.

The initial turn and victory rules have now been implemented and playtested; see [arena v1](arena-v1.md) for the current scope and limitations.
