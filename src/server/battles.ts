import { enforceLimit } from "./rate-limits.ts";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { restoreMatch } from "../shared/engine.ts";
import {
  battleSchema,
  battleSummarySchema,
  saveBattleSchema,
} from "../shared/contracts/battles.ts";
import { battles } from "./db/battle-schema.ts";
import { readCatalog } from "./db/catalog.ts";

export class BattleError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const summary = (row: typeof battles.$inferSelect) =>
  battleSummarySchema.parse({
    id: row.id,
    revision: row.revision,
    status: row.status,
    result: row.result,
    moves: row.moves,
    updatedAt: row.updatedAt,
    playerIds: row.replay.playerIds,
  });

export async function listBattles(binding: D1Database, userId: string) {
  const rows = await drizzle(binding)
    .select()
    .from(battles)
    .where(eq(battles.userId, userId))
    .orderBy(desc(battles.updatedAt), desc(battles.id))
    .limit(20);
  return { battles: rows.map(summary) };
}

export async function getBattle(
  binding: D1Database,
  userId: string,
  id: string,
) {
  const row = await drizzle(binding)
    .select()
    .from(battles)
    .where(and(eq(battles.userId, userId), eq(battles.id, id)))
    .get();
  if (!row) throw new BattleError(404, "Battle not found.");
  return battleSchema.parse({
    ...summary(row),
    replay: row.replay,
    catalog: row.catalog,
  });
}

export async function saveBattle(
  binding: D1Database,
  userId: string,
  id: string,
  input: unknown,
  newBattleLimiter: RateLimit,
) {
  const { revision, replay } = saveBattleSchema.parse(input);
  const db = drizzle(binding);
  const identity = and(eq(battles.userId, userId), eq(battles.id, id));
  const previous = await db.select().from(battles).where(identity).get();

  // A lost response may be retried safely without incrementing the revision again.
  if (previous && JSON.stringify(previous.replay) === JSON.stringify(replay))
    return summary(previous);
  if ((previous?.revision ?? 0) !== revision)
    throw new BattleError(
      409,
      "A newer save exists. Open My battles to resume it.",
    );
  if (previous) {
    const old = previous.replay;
    if (
      old.version !== replay.version ||
      old.catalogRevision !== replay.catalogRevision ||
      JSON.stringify(old.playerIds) !== JSON.stringify(replay.playerIds) ||
      JSON.stringify(old.botIds) !== JSON.stringify(replay.botIds) ||
      JSON.stringify(replay.actions.slice(0, old.actions.length)) !==
        JSON.stringify(old.actions)
    ) {
      throw new BattleError(
        409,
        "This save cannot replace an existing battle with a different history.",
      );
    }
  }

  if (!previous) await enforceLimit(newBattleLimiter, userId);

  // The server supplies the immutable stat snapshot; clients can only submit legal actions.
  const catalog = previous
    ? { cards: previous.catalog, revision: previous.replay.catalogRevision }
    : await readCatalog(binding);
  if (replay.catalogRevision !== catalog.revision)
    throw new BattleError(
      409,
      "Card data changed. Start a new battle to save it online.",
    );
  let state;
  try {
    state = restoreMatch(replay, catalog.cards, catalog.revision);
  } catch {
    throw new BattleError(400, "Battle contains an invalid lineup or action.");
  }
  const result = state.winner as "player" | "bot" | "draw" | null;
  const values = {
    replay,
    catalog: catalog.cards,
    revision: revision + 1,
    status: result ? ("completed" as const) : ("in_progress" as const),
    result,
    moves: replay.actions.length,
    updatedAt: Date.now(),
  };
  let rows;
  try {
    rows = previous
      ? await db
          .update(battles)
          .set(values)
          .where(and(identity, eq(battles.revision, revision)))
          .returning()
      : await db
          .insert(battles)
          .values({ ...values, userId, id, createdAt: Date.now() })
          .onConflictDoNothing()
          .returning();
  } catch (error) {
    // Drizzle wraps D1 errors; inspect only the known trigger sentinel.
    let cause: unknown = error;
    for (let depth = 0; depth < 5 && cause instanceof Error; depth++) {
      if (cause.message.includes("casper_battle_quota"))
        throw new BattleError(
          507,
          "Cloud storage is full (200 battles). Existing battles can still be resumed. This battle is backed up in this browser.",
        );
      cause = cause.cause;
    }
    throw error;
  }
  if (!rows[0])
    throw new BattleError(
      409,
      "Another tab saved this battle first. Open My battles to resume it.",
    );
  return summary(rows[0]);
}
