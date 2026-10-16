# Arena v1

## Implemented behavior

The local prototype has six Fusion World Battle-card definitions, with images and collectible references from two Collector Crypt inventory samples. Select three different definitions with printed cost totaling at most 14. Two different Son Goku definitions may be selected together. The bot fields Gohan FB01-140, Piccolo SB02-043, and Cheelai FB09-012.

All fighters start at 100 custom arena HP. Both teams start with 4 shared energy, capped at 6. Each incoming turn recovers 1 energy; the first player begins immediately without that recovery. The player always starts in v1.

- Attack energy: printed cost divided by 3, rounded up, minimum 1.
- Base damage: printed power divided by 2,000, rounded to the nearest integer.
- Combo: one ready, living teammate with positive combo power can support for 1 extra energy. Add combo power divided by 1,000 to damage.
- Recovery: the attacker and supporter cannot act during their next own turn.
- Charge: gain up to 3 energy and guard the next incoming hit. Guard multiplies damage by 0.6, rounded down with a minimum of 1. Guard does not stack or expire until hit.
- End: knock out all enemy fighters. After 60 total turns, compare remaining team HP; ties draw.

Printed skills, colors as resource restrictions, official decks, and Leaders are not active. A printed combo dash is retained as null and cannot provide support. Grade, price, and prize tier never affect combat.

## Sources and assets

`public/cards.json` retains the official stats URL, verification date, collectible mint, image source, original name/description, inventory source, and mapping limitation for each record. Card-definition matches do not certify the exact alternate-art printing.

| Definition | Power | Combo | Cost | Official source |
| --- | ---: | ---: | ---: | --- |
| Son Goku FB05-030 | 25,000 | — | 3 | [Bandai](https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=FB05-030&p=_p2) |
| Piccolo SB02-043 | 25,000 | 5,000 | 4 | [Bandai](https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=SB02-043&p=_p2) |
| Son Gohan FB01-140 | 50,000 | — | 7 | [Bandai](https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=FB01-140&p=_p1) |
| Broly FB06-120 | 55,000 | — | 9 | [Bandai](https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=FB06-120&p=_p1) |
| Cheelai FB09-012 | 5,000 | 10,000 | 1 | [Bandai, Japanese](https://www.dbs-cardgame.com/fw/jp/cardlist/detail.php?card_no=FB09-012) |
| Son Goku FB05-119 | 45,000 | — | 7 | [Bandai](https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=FB05-119&p=_p4) |

The client loads a local snapshot, not live inventory. There are no authenticated provider calls. Images retain their provider bytes as WebP assets; provider URLs did not have filename extensions.

## Persistence

The browser stores the selected team and a versioned action history under `casper-arena-v1`. Refresh replays validated moves through the same engine. A pending bot turn resumes after refresh; completed results remain visible. Invalid or incompatible saves do not enter the engine. The UI warns if browser storage cannot be used. This local state is practice progress, never proof of ownership.

## Verification on October 16, 2026

- Nine Node tests pass: roster/source presence, team limits, support damage, recovery, guard, invalid moves, knockouts, turn-limit draw, replay recovery, and complete bot simulations across all nine valid team combinations.
- Browser playtest completed a 60-turn match: player won by remaining HP, 118 to 48. Rematch and returning to team selection worked.
- A supported attack dealt 23 damage; the bot responded; refresh restored turn 3, energy, HP, and recovery states.
- Desktop and 390-pixel phone layouts inspected. Phone document width matched viewport width, and all visible images loaded.
- Card detail dialog shows separate printed stats, custom arena values, and source links.

These checks verify function, not competitive balance. Automated simulations favored the first-moving player and several reached the turn limit. Longer balance testing, pacing changes, and multiplayer are future work.
