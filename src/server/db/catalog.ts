import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { catalogSchema } from "../../shared/contracts/catalog.ts";
import { cardDefinitions, collectibles, specialAttacks } from "./schema.ts";

export async function readCatalog(binding: D1Database) {
  const rows = await drizzle(binding)
    .select({
      card: cardDefinitions,
      collectible: collectibles,
      special: specialAttacks,
    })
    .from(cardDefinitions)
    .leftJoin(
      collectibles,
      eq(cardDefinitions.referenceMint, collectibles.mint),
    )
    .leftJoin(specialAttacks, eq(cardDefinitions.id, specialAttacks.cardId))
    .orderBy(asc(cardDefinitions.position), asc(cardDefinitions.id));

  // Left joins ensure incomplete definitions fail validation instead of disappearing silently.
  const cards = catalogSchema.parse(
    rows.map((row) => {
      const { referenceMint, position, ...card } = row.card;
      const { cardId, ...special } = row.special ?? {};
      return { ...card, collectible: row.collectible, special };
    }),
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(cards)),
  );
  const revision = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return { revision, cards };
}
