import { seedCards } from "../scripts/lib/seed-catalog.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inventoryRequest,
  normalizeInventory,
  createInventoryLoader,
} from "../src/inventory.ts";
import {
  collectibleUrl,
  definitionFor,
  mergeInventory,
  MARKETPLACE,
} from "../src/client/collection.ts";
import type { InventoryPage } from "../src/contracts/inventory.ts";
const cards = seedCards,
  mint = cards[0].collectible.mint;
const source = new URL(
  "https://gacha.collectorcrypt.com/api/getNfts?code=dragonball_50&limit=24",
);
const page = {
  nfts: [
    {
      nft_address: mint,
      name: "Goku",
      image: "https://d1xpxki1g4htqu.cloudfront.net/card",
    },
  ],
  hasMore: true,
  nextCursor: "opaque+/=token",
};
test("inventory accepts only known pools, fixed endpoint and opaque bounded cursor", () => {
  const url = inventoryRequest(
    new URLSearchParams({ code: "dragonball_100", cursor: page.nextCursor }),
  );
  assert.equal(url.origin, source.origin);
  assert.equal(url.searchParams.get("cursor"), page.nextCursor);
  assert.equal(url.searchParams.get("limit"), "24");
  for (const params of [
    { code: "pokemon_50" },
    { url: "https://evil.test" },
    { cursor: "x".repeat(513) },
    { cursor: "a\nb" },
  ])
    assert.throws(() =>
      inventoryRequest(
        new URLSearchParams(
          Object.entries(params).map(([key, value]) => [key, String(value)]),
        ),
      ),
    );
});
test("malformed inventory and unsafe links fail closed", () => {
  assert.throws(() => normalizeInventory({ nfts: [], hasMore: true }, source));
  const result = normalizeInventory(
    {
      ...page,
      nfts: [
        { nft_address: "<script>", name: "x" },
        { nft_address: mint, image: "javascript:alert(1)" },
      ],
    },
    source,
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].image, null);
  assert.equal(collectibleUrl("../bad"), MARKETPLACE);
  assert.equal(
    collectibleUrl(mint),
    "https://collectorcrypt.com/assets/solana/" + mint,
  );
});
test("cache coalesces simultaneous reads and failed reads can be retried", async () => {
  let calls = 0;
  const mockPage = { ok: true, json: async () => page } as Response;
  const load = createInventoryLoader((async () => {
    calls++;
    return mockPage;
  }) as typeof fetch);
  await Promise.all([load(new URLSearchParams()), load(new URLSearchParams())]);
  assert.equal(calls, 1);
  let attempt = 0;
  const retry = createInventoryLoader((async () => {
    if (!attempt++) throw new Error("offline");
    return mockPage;
  }) as typeof fetch);
  await assert.rejects(retry(new URLSearchParams()));
  assert.equal((await retry(new URLSearchParams())).items.length, 1);
});
test("inventory is deduplicated by asset while battle matching requires verified family and number", () => {
  const item: InventoryPage["items"][number] = {
    mint: "another",
    name: "2025 #FB02061 Vegito",
    description: "Dragon Ball Super Card Game Fusion World",
    image: null,
    rarity: "unknown",
  };
  assert.equal(definitionFor(item, cards)?.id, "FB02-061");
  assert.equal(definitionFor({ ...item, description: "Masters" }, cards), null);
  assert.equal(
    definitionFor(
      { ...item, name: "Energy Marker E-44", description: "Fusion World" },
      cards,
    ),
    null,
  );
  assert.equal(
    mergeInventory(
      [{ mint: "a" }],
      [{ mint: "a" }, { mint: "b" }, { mint: "b" }],
    ).length,
    2,
  );
});
