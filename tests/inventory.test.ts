import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  inventoryRequest,
  normalizeInventory,
  createInventoryLoader,
} from "../scripts/inventory.ts";
import {
  collectibleUrl,
  definitionFor,
  mergeInventory,
  MARKETPLACE,
} from "../src/client/collection.ts";
import {
  inventoryApiPath,
  inventoryCodes,
  inventoryRows,
} from "../src/client/Collection.tsx";
import type { Card } from "../src/shared/types.ts";
import type { InventoryItem } from "../src/client/collection.ts";
const cards = JSON.parse(
    readFileSync(new URL("../public/cards.json", import.meta.url), "utf8"),
  ) as Card[],
  mint = cards[0]!.collectible.mint;
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
  ] as Record<string, string>[])
    assert.throws(() => inventoryRequest(new URLSearchParams(params)));
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
  assert.equal(result.items[0].image, "");
  assert.equal(collectibleUrl("../bad"), MARKETPLACE);
  assert.equal(
    collectibleUrl(mint),
    "https://collectorcrypt.com/assets/solana/" + mint,
  );
});
test("cache coalesces simultaneous reads and failed reads can be retried", async () => {
  let calls = 0;
  const load = createInventoryLoader(async () => {
    calls++;
    return { ok: true, json: async () => page };
  });
  await Promise.all([load(new URLSearchParams()), load(new URLSearchParams())]);
  assert.equal(calls, 1);
  let attempt = 0;
  const retry = createInventoryLoader(async () => {
    if (!attempt++) throw new Error("offline");
    return { ok: true, json: async () => page };
  });
  await assert.rejects(retry(new URLSearchParams()));
  assert.equal((await retry(new URLSearchParams())).items.length, 1);
});
test("inventory is deduplicated by asset while battle matching requires verified family and number", () => {
  const item = {
    mint: "another",
    name: "2025 #FB02061 Vegito",
    description: "Dragon Ball Super Card Game Fusion World",
    image: "",
  };
  assert.equal(definitionFor(item, cards)!.id, "FB02-061");
  assert.equal(definitionFor({ ...item, description: "Masters" }, cards), null);
  assert.equal(
    definitionFor(
      {
        mint: "marker",
        name: "Energy Marker E-44",
        description: "Fusion World",
        image: "",
      },
      cards,
    ),
    null,
  );
  assert.equal(
    mergeInventory(
      [{ mint: "a", name: "", description: "", image: "" }],
      [
        { mint: "a", name: "", description: "", image: "" },
        { mint: "b", name: "", description: "", image: "" },
        { mint: "b", name: "", description: "", image: "" },
      ],
    ).length,
    2,
  );
});

test("inventory browser uses the same normalized local proxy for all three pools", () => {
  assert.deepEqual(inventoryCodes, [
    "dragonball_50",
    "dragonball_100",
    "dragonball_250",
  ]);
  for (const code of inventoryCodes) {
    const url = new URL(
      inventoryApiPath(code, "opaque+/=token"),
      "http://127.0.0.1",
    );
    assert.equal(url.pathname, "/api/inventory");
    assert.equal(url.searchParams.get("code"), code);
    assert.equal(url.searchParams.get("cursor"), "opaque+/=token");
  }
});
test("collection rows retain unmatched collectibles as browse-only items", () => {
  const known: InventoryItem = {
    mint,
    name: "Known Goku",
    description: "",
    image: "",
  };
  const unknown: InventoryItem = {
    mint: "another-unmatched-asset",
    name: "Unverified card",
    description: "Not a verified Fusion World battle card",
    image: "",
  };
  const rows = inventoryRows([known, unknown], cards);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.card?.collectible.mint, mint);
  assert.equal(rows[1]?.card, null);
  assert.equal(rows[1]?.item.mint, unknown.mint);
});
