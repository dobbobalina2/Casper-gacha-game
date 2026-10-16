# Collector Crypt integration

## Confirmed direction

Casper uses actual Collector Crypt collectibles. The initial collection and gameplay beyond pack opening remain undecided.

## Documentation reviewed on October 16, 2026

- [Gacha API](https://docs.collectorcrypt.com/gacha/api): inventory via `GET /api/getNfts`; wallet-signed purchase, submission, and opening endpoints; a development environment. Use live machine odds. Send `x-api-key`: play routes can silently accept an invalid key without partner attribution. Verify credentials through an authenticated partner route. Preserve the pack memo across retries.
- [Invoiced API](https://docs.collectorcrypt.com/gacha/invoiced-api): partners manage accounts and payments; Collector Crypt holds awarded cards and invoices the partner. Requires environment-specific credentials. This is a separate integration option.

## Live read verified

Read-only request, without credentials:

```text
GET https://gacha.collectorcrypt.com/api/getNfts?code=pokemon_50&limit=1
```

Returned one item and `hasMore: true`, with a continuation cursor:

- Name: `2021 #215 Full Art/Umbreon Vmax`
- Rarity: `epic`
- Asset: `fZ1zjsqo8fZLRRPBo5wQmtroaZPcYSKYBawHHEzHzwK`
- Image URL present.

This verifies inventory access at the time of the check, not continued availability or ownership. No purchase, signing, award, or buyback was attempted.

## Proposed implementation sequence

Deferred until the game concept is selected.

1. Build an inventory browser with the actual returned images and metadata.
2. Choose the wallet or invoiced integration and configure its credentials server-side.
3. Implement and verify the development pack flow, recovery, and holdings.
4. Add Casper's game presentation around verified results.

Do not use a local random draw to claim an actual collectible award. Keep partner credentials out of browser bundles and source control.

## Collection breadth checked on October 16, 2026

A live read of [the public machine endpoint](https://gacha.collectorcrypt.com/api/machines) returned public machines with positive reported stock for Pokémon, One Piece, Riftbound, Dragonball, anime/pop culture, watches, and sports (including basketball, baseball, football, and soccer). Pokémon also included a sealed-product machine. The [public gacha site](https://gacha.collectorcrypt.com/) lists these broader categories.

These are candidate themes, not a guarantee of partner access or purchase availability. Stock changes, and machine pools may overlap.
