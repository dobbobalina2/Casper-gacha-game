# Recurring integration pitfalls

- Collector Crypt's Dragon Ball inventory sample mixes fighter candidates and energy markers; `Type: Card` is not a gameplay type. Match an official card definition before making an item playable.
- Inventory names may be truncated or omit the card-number separator. Preserve the original asset identity and text; do not resolve cards using character name alone.
- Grading, insured value, and gacha rarity are not combat stats. The first 12 Dragon Ball records inspected did not expose structured power, cost, or combo power in their attributes or content metadata; source and verify those separately.
- Collector Crypt image URLs have no extension; the six downloaded assets were WebP. Use the response content type rather than assuming JPEG.

- Recovery plus guarding can create long one-fighter endgames. Keep all-lineup knockout pacing checks when changing damage or recovery, and inspect per-team results rather than only aggregate wins.
- Cancelled animation promises can settle after a new match starts. Guard both the UI continuation and effect cleanup with generation tokens; save combat before presentation begins.

- Collector Crypt gacha inventory is not a sale listing. Use the exact asset page for availability; never label insured value as the purchase price. Preserve opaque inventory cursors unchanged and deduplicate by mint, not card definition.
