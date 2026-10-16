import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/d1";
import { catalogSchema } from "../src/contracts/catalog.ts";
import {
  cardDefinitions,
  collectibles,
  specialAttacks,
} from "../src/db/schema.ts";

// Generate reviewed data migrations with Drizzle's column mappings and Zod validation.
// No DB connection is made and no remote write is performed by this command.
export function catalogSql(input: unknown): string {
  const cards = catalogSchema.parse(input);
  const db = drizzle({} as D1Database);
  const statements: string[] = [];
  const literal = (value: unknown): string => {
    if (value === null) return "NULL";
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
    if (typeof value === "string")
      return "'" + value.replaceAll("'", "''") + "'";
    throw new Error("Unsupported SQL parameter");
  };
  const append = (query: { toSQL(): { sql: string; params: unknown[] } }) => {
    const { sql, params } = query.toSQL();
    let index = 0;
    statements.push(sql.replace(/\?/g, () => literal(params[index++])) + ";");
  };
  for (const [position, card] of cards.entries()) {
    const { collectible, special, ...definition } = card;
    append(
      db
        .insert(collectibles)
        .values(collectible)
        .onConflictDoUpdate({ target: collectibles.mint, set: collectible }),
    );
    const row = { ...definition, referenceMint: collectible.mint, position };
    append(
      db
        .insert(cardDefinitions)
        .values(row)
        .onConflictDoUpdate({ target: cardDefinitions.id, set: row }),
    );
    const attack = { ...special, cardId: card.id };
    append(
      db
        .insert(specialAttacks)
        .values(attack)
        .onConflictDoUpdate({ target: specialAttacks.cardId, set: attack }),
    );
  }
  return (
    "-- Validated catalog data. Official stats and custom specials remain separate.\n" +
    statements.join("\n--> statement-breakpoint\n") +
    "\n"
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw new Error(
      "Usage: npm run catalog:prepare -- input.json new-migration.sql",
    );
  const sql = catalogSql(JSON.parse(readFileSync(input, "utf8")));
  // Refuse to overwrite an already reviewed/applied migration.
  writeFileSync(output, sql, { flag: "wx" });
  console.log(`Validated catalog migration written to ${output}`);
}
