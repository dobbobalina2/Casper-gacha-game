import { z } from "zod";
import { desc, eq, lte, notInArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { collectibleImageSchema, mintSchema } from "./contracts/catalog.ts";
import {
  cursorSchema,
  inventoryPageSchema,
  inventoryQuerySchema,
} from "./contracts/inventory.ts";
import type { InventoryPage } from "./contracts/inventory.ts";
import { inventoryPages } from "./db/schema.ts";

const upstreamSchema = z.object({
  nfts: z.array(
    z.object({
      nft_address: z.unknown().optional(),
      name: z.unknown().optional(),
      description: z.unknown().optional(),
      image: z.unknown().optional(),
      rarity: z.unknown().optional(),
    }),
  ),
  hasMore: z.boolean(),
  nextCursor: z.unknown().optional(),
});

export function inventoryRequest(params: URLSearchParams) {
  if (new Set(params.keys()).size !== [...params.keys()].length) {
    throw new Error("Duplicate inventory parameters");
  }
  const query = inventoryQuerySchema.parse(Object.fromEntries(params));
  const url = new URL("https://gacha.collectorcrypt.com/api/getNfts");
  url.searchParams.set("code", query.code);
  url.searchParams.set("limit", "24");
  if (query.cursor) url.searchParams.set("cursor", query.cursor);
  return url;
}

export function normalizeInventory(input: unknown, source: URL): InventoryPage {
  const data = upstreamSchema.parse(input);
  const nextCursor = data.hasMore ? cursorSchema.parse(data.nextCursor) : null;
  const items = data.nfts.slice(0, 24).flatMap((item) => {
    const mint = mintSchema.safeParse(item.nft_address);
    if (!mint.success) return [];
    const image = collectibleImageSchema.safeParse(item.image);
    const rarity = z
      .enum(["common", "uncommon", "rare", "epic"])
      .safeParse(item.rarity);
    return [
      {
        mint: mint.data,
        name: String(item.name || "Unnamed collectible").slice(0, 250),
        description: String(item.description || "").slice(0, 1000),
        image: image.success ? image.data : null,
        rarity: rarity.success ? rarity.data : ("unknown" as const),
      },
    ];
  });
  return inventoryPageSchema.parse({
    items,
    hasMore: data.hasMore,
    nextCursor,
    source: source.href,
    fetchedAt: new Date().toISOString(),
  });
}

export function createInventoryLoader(
  fetchImpl: typeof fetch = fetch,
  binding?: D1Database,
) {
  const pending = new Map<string, Promise<InventoryPage>>();
  const memory = new Map<string, { until: number; value: InventoryPage }>();
  const db = binding ? drizzle(binding) : null;

  async function load(url: URL): Promise<InventoryPage> {
    const key = url.href;
    const cached = memory.get(key);
    if (cached && cached.until > Date.now()) return cached.value;
    if (db) {
      const row = await db
        .select()
        .from(inventoryPages)
        .where(eq(inventoryPages.source, key))
        .get();
      if (row && row.expiresAt > Date.now()) {
        const parsed = inventoryPageSchema.safeParse(row.payload);
        if (parsed.success && parsed.data.source === key) return parsed.data;
      }
    }
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(10000),
      redirect: "manual",
    });
    if (!response.ok) throw new Error("Collector Crypt is unavailable");
    const value = normalizeInventory(await response.json(), url);
    const until = Date.now() + 60000;
    if (db) {
      await db.batch([
        db
          .insert(inventoryPages)
          .values({ source: key, payload: value, expiresAt: until })
          .onConflictDoUpdate({
            target: inventoryPages.source,
            set: { payload: value, expiresAt: until },
          }),
        db
          .delete(inventoryPages)
          .where(lte(inventoryPages.expiresAt, Date.now())),
        db
          .delete(inventoryPages)
          .where(
            notInArray(
              inventoryPages.source,
              db
                .select({ source: inventoryPages.source })
                .from(inventoryPages)
                .orderBy(
                  desc(inventoryPages.expiresAt),
                  desc(inventoryPages.source),
                )
                .limit(20),
            ),
          ),
      ]);
    }
    if (memory.size >= 20) memory.delete(memory.keys().next().value!);
    memory.set(key, { until, value });
    return value;
  }

  return async (params: URLSearchParams) => {
    const url = inventoryRequest(params);
    const existing = pending.get(url.href);
    if (existing) return existing;
    const promise = load(url);
    pending.set(url.href, promise);
    try {
      return await promise;
    } finally {
      pending.delete(url.href);
    }
  };
}
