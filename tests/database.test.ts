import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  Miniflare,
  convertV4MiniflareOptions,
  Response as RuntimeResponse,
} from "miniflare";
import {
  catalogResponseSchema,
  catalogSchema,
} from "../src/contracts/catalog.ts";
import { createInventoryLoader } from "../src/inventory.ts";
import { seedCards } from "../scripts/lib/seed-catalog.ts";
import { catalogSql } from "../scripts/prepare-catalog.ts";

let runtime: Miniflare;
let db: D1Database;
let upstreamStatus = 200;
async function executeMigration(sql: string) {
  const queries = sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  await db.batch(queries.map((query) => db.prepare(query)));
}
async function catalog() {
  const response = await runtime.dispatchFetch(
    "http://casper.test/api/catalog",
  );
  assert.equal(response.status, 200);
  return catalogResponseSchema.parse(await response.json());
}

before(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: "dist/worker.js",
      compatibilityDate: "2026-10-01",
      d1Databases: { DB: "test-casper" },
      outboundService: (request) => {
        assert.equal(
          new URL(request.url).origin,
          "https://gacha.collectorcrypt.com",
        );
        return new RuntimeResponse(
          JSON.stringify({ nfts: [], hasMore: false }),
          {
            status: upstreamStatus,
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    }),
  );
  db = (await runtime.getD1Database("DB")) as unknown as D1Database;
  for (const file of readdirSync("db/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await executeMigration(readFileSync(`db/migrations/${file}`, "utf8"));
  }
});
after(async () => {
  await runtime?.dispose();
});

test("fresh D1 migrations preserve every sourced stat, special and collectible", async () => {
  const result = await catalog();
  assert.deepEqual(result.cards, seedCards);
  assert.equal((await catalog()).revision, result.revision);
  // Re-import is idempotent and does not duplicate or alter definitions.
  await executeMigration(catalogSql(seedCards));
  assert.deepEqual(await catalog(), result);
});

test("database changes drive the API and revision without a frontend rebuild", async () => {
  const original = await catalog();
  await db
    .prepare("UPDATE special_attacks SET bonus = bonus + 1 WHERE card_id = ?")
    .bind(seedCards[0].id)
    .run();
  try {
    const changed = await catalog();
    assert.equal(
      changed.cards[0].special.bonus,
      original.cards[0].special.bonus + 1,
    );
    assert.notEqual(changed.revision, original.revision);
  } finally {
    await executeMigration(catalogSql(seedCards));
  }
});

test("foreign keys and stat checks prevent invalid writes; batches roll back", async () => {
  await assert.rejects(
    db
      .prepare("UPDATE card_definitions SET reference_mint = ? WHERE id = ?")
      .bind("missing", seedCards[0].id)
      .run(),
  );
  await assert.rejects(
    db.batch([
      db
        .prepare("UPDATE card_definitions SET power = 1 WHERE id = ?")
        .bind(seedCards[0].id),
      db
        .prepare("UPDATE card_definitions SET cost = -1 WHERE id = ?")
        .bind(seedCards[1].id),
    ]),
  );
  assert.deepEqual((await catalog()).cards, seedCards);
});

test("invalid or missing special rows fail closed at the API boundary", async () => {
  await db
    .prepare("DELETE FROM special_attacks WHERE card_id = ?")
    .bind(seedCards[0].id)
    .run();
  try {
    const response = await runtime.dispatchFetch(
      "http://casper.test/api/catalog",
    );
    assert.equal(response.status, 503);
    assert.equal(
      ((await response.json()) as { error: string }).error.includes("catalog"),
      true,
    );
  } finally {
    await executeMigration(catalogSql(seedCards));
  }
});

test("Zod rejects duplicate IDs, untrusted links, malformed audio and impossible energy costs", () => {
  for (const mutate of [
    (cards: typeof seedCards) => {
      cards[1].id = cards[0].id;
    },
    (cards: typeof seedCards) => {
      cards[0].statsSource = "javascript:alert(1)";
    },
    (cards: typeof seedCards) => {
      cards[0].special.notes[0][5] = 10;
    },
    (cards: typeof seedCards) => {
      cards[0].cost = 12;
      cards[0].special.extraEnergy = 3;
    },
    (cards: typeof seedCards) => {
      cards[0].power = -1;
    },
  ]) {
    const invalid = structuredClone(seedCards);
    mutate(invalid);
    assert.throws(() => catalogSchema.parse(invalid));
    assert.throws(() => catalogSql(invalid));
  }
});

test("validated imports preserve quoted text and never interpolate it as SQL", async () => {
  const cards = structuredClone(seedCards);
  cards[0].name = "Goku's ? card'; DROP TABLE special_attacks; --";
  try {
    await executeMigration(catalogSql(cards));
    assert.equal((await catalog()).cards[0].name, cards[0].name);
  } finally {
    await executeMigration(catalogSql(seedCards));
  }
});

test("inventory observations survive loader restarts, expire, and remain bounded", async () => {
  let calls = 0;
  const fetchPage: typeof fetch = async () => {
    calls++;
    return Response.json({ nfts: [], hasMore: false });
  };
  const params = new URLSearchParams({ code: "dragonball_50" });
  const first = await createInventoryLoader(fetchPage, db)(params);
  assert.deepEqual(await createInventoryLoader(fetchPage, db)(params), first);
  assert.equal(calls, 1);
  await db.prepare("UPDATE inventory_pages SET expires_at = 0").run();
  await createInventoryLoader(fetchPage, db)(params);
  assert.equal(calls, 2);
  const load = createInventoryLoader(fetchPage, db);
  for (let index = 0; index < 23; index++) {
    await load(new URLSearchParams({ cursor: `page-${index}` }));
  }
  assert.equal(
    await db
      .prepare("SELECT COUNT(*) AS count FROM inventory_pages")
      .first("count"),
    20,
  );
  assert.equal((await catalog()).cards.length, 8);
});

test("API rejects writes, unknown routes and duplicate or unrecognized inventory parameters", async () => {
  assert.equal(
    (
      await runtime.dispatchFetch("http://casper.test/api/catalog", {
        method: "POST",
      })
    ).status,
    405,
  );
  assert.equal(
    (await runtime.dispatchFetch("http://casper.test/api/unknown")).status,
    404,
  );
  for (const query of [
    "code=wrong",
    "url=https://example.com",
    "code=dragonball_50&code=dragonball_100",
  ]) {
    assert.equal(
      (await runtime.dispatchFetch(`http://casper.test/api/inventory?${query}`))
        .status,
      400,
    );
  }
  const head = await runtime.dispatchFetch("http://casper.test/api/catalog", {
    method: "HEAD",
  });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("Worker fetch uses a supported redirect mode and rejects upstream redirects", async () => {
  const response = await runtime.dispatchFetch(
    "http://casper.test/api/inventory?code=dragonball_250",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(((await response.json()) as { items: unknown[] }).items, []);
  upstreamStatus = 302;
  try {
    assert.equal(
      (
        await runtime.dispatchFetch(
          "http://casper.test/api/inventory?code=dragonball_250&cursor=redirect-test",
        )
      ).status,
      502,
    );
  } finally {
    upstreamStatus = 200;
  }
});
