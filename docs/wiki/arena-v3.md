# Arena v3 — signature moves and Collector Crypt browsing

Implemented October 16, 2026. Data storage and serving are now superseded by [the D1 architecture](database.md). Builds on [v2 pacing](arena-v2.md), with eight verified fighters and one special per card per match. All special mechanics below are Casper adaptations inspired by characters, not official printed card skills.

## Signature attacks

A special requires a ready, living fighter, a standing enemy, and its full energy cost. It replaces the normal attack, cannot use support, consumes that fighter's special for the match, and follows normal recovery. The bot can use the same specials. Guard applies to target and splash damage from the same action unless the move explicitly pierces it.

| Fighter | Special / energy | Effect beyond normal base damage | Presentation |
| --- | --- | --- | --- |
| Goku FB05-030 | Kamehameha / 2 | +16 damage | Wide blue beam, rising charge and descending blast |
| Piccolo SB02-043 | Special Beam Cannon / 3 | +10 damage, ignores guard | Purple segmented beam and rings, high piercing sweep |
| Gohan FB01-140 | Masenko / 4 | +12 damage; +30 instead when own HP ≤50 | Three golden rays and burst, sharp two-tone blast |
| Broly FB06-120 | Eraser Cannon / 5 | +5 damage, 12 splash to each other standing enemy | Traveling green orb and shock ring, low bass impact |
| Cheelai FB09-012 | Cover Fire / 2 | +8 damage, refund 2 energy, guard own team | Three pink projectiles and staggered blaster sounds |
| Goku FB05-119 | Spirit Bomb / 5 | +14 damage, 6 splash to each other standing enemy | Large cyan orb and expanding ring, layered charge chord |
| Trunks SB02-010 | Burning Slash / 2 | +12 damage; +30 instead when target HP ≤40 | Crossed orange slashes, two sword sweeps |
| Vegito FB02-061 | Spirit Sword / 2 | +10 damage, drain up to 2 enemy energy before their normal +2 recovery | Blue sword slash, resonant rising and falling tones |

Used specials remain marked on their cards and are preserved by replay recovery. Energy refunds cap at 6, drain floors at 0, splash does not hit already knocked-out cards, and a multi-knockout ends the match. Reduced motion removes movement/flash/particle effects and uses short text fades. Sound remains gesture-activated with the existing saved mute and volume controls.

Replays now require `arena-v3`. Earlier matches reset with an explanation; selected lineups remain saved.

## Added verified cards

These two definitions were matched to actual assets in the Dragon Ball 50 inventory, using card number and Fusion World family, then checked against official Bandai detail pages. Exact alternate-art printing remains unverified.

| Definition | Type / color | Cost | Power | Combo | Evidence |
| --- | --- | ---: | ---: | ---: | --- |
| Trunks : Future SB02-010 | Battle / Red | 2 | 5,000 | 10,000 | [Bandai](https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=SB02-010) |
| Vegito FB02-061 | Battle / Blue | 3 | 25,000 | 5,000 | [Bandai](https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=FB02-061) |

Sources and exact collectible mints are retained in `public/cards.json`. Their original WebP images are local assets. The remaining inventory is not automatically converted into fighters: it includes energy markers, Leaders, other game families, duplicate assets, and definitions whose stats have not yet been verified.

## Live collection and external purchase links

The lobby has a live collection section with Dragon Ball 50/100/250 pool selection and a Load more button. It requests 24 records at a time through the documented `nextCursor` contract and deduplicates by mint. Matching verified definitions are labeled arena-ready; unmatched collectibles remain browse-only. The practice roster continues working if the inventory service fails. Loading, retry, empty/end, failed-image, and error states are explicit.

The localhost server exposes one read-only route, `/api/inventory`, backed by the fixed `https://gacha.collectorcrypt.com/api/getNfts` endpoint. Only three known Dragon Ball machine codes and a bounded opaque cursor are accepted. No arbitrary upstream URL, wallet, credential, or transaction is accepted. Responses are normalized to display metadata and validated image hosts; upstream failures become a retryable 502. A maximum 20-entry, 60-second cache coalesces duplicate requests. The upstream timeout is 10 seconds, client timeout 15 seconds. The server needs outbound HTTPS access; any hosting change needs to retain the Node route, not deploy only static files.

Roster cards, details, and live inventory link to `https://collectorcrypt.com/assets/solana/<mint>` in a separate tab. This exact route was verified through Collector Crypt's marketplace search for the existing Piccolo asset. Its page showed **Make an offer**, not a Buy listing. Therefore buttons say **View / buy** and explain that availability is determined on Collector Crypt. The marketplace link is also available separately. Gacha inventory presence and insured value are never treated as proof of a direct sale listing or asking price.

Casper performs no checkout, wallet connection, signing, purchase, offer, or ownership verification. Buying externally does not currently unlock a card inside Casper.

Reference: [Collector Crypt inventory API](https://docs.collectorcrypt.com/gacha/api#get-nfts---apigetnfts), [marketplace](https://collectorcrypt.com/marketplace/cards).

## Balance and verification

The expanded eight-card roster has **36** legal lineups. The same deterministic bot policy on both sides completed **1,296 ordered pairings** with **0 turn-limit finishes**, median **21**, range **14–34** total turns. First seat won **729 / 1,296** (56.25%). These simulations include specials and mirrors; they do not establish equal lineup strength or human competitive balance. See [raw report](../balance/arena-v3.json) and run `npm run balance`.

Node tests cover all existing combat behavior, each special mechanic and threshold, once-per-match gating, energy, recovery, replay, presentation completion for all eight moves, reduced motion, audio activation/mute, inventory validation, duplicate pagination, fail-closed matching, coalescing, and failed-fetch retry. Run `npm test` and `npm run check`.

Browser verification: loaded 24 then 48 unique collectibles from Dragon Ball 50, and 24 from Dragon Ball 100. Newly rendered images loaded without observed failures. Clicked the Vegito roster purchase link and confirmed its matching Collector Crypt asset page, which also showed Make an offer. Observed Goku, Piccolo, Gohan, Trunks, and Vegito specials plus the bot's Spirit Bomb; a complete match ended on turn 20 with player 0 HP and bot 10 HP. Used specials and the result survived refresh. The 390 px phone layout had no horizontal overflow, and the new fighters' special controls worked. No browser console errors were recorded during that match. All 25 Node tests and syntax checks passed.

The battle log is always visible beside the battle controls and shows the five most recent entries.
