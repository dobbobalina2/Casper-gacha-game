import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema.ts";
import type { Replay } from "../contracts/battles.ts";
import type { Card } from "../contracts/catalog.ts";

export const battles = sqliteTable(
  "battles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    revision: integer("revision").notNull(),
    replay: text("replay", { mode: "json" }).$type<Replay>().notNull(),
    catalog: text("catalog", { mode: "json" }).$type<Card[]>().notNull(),
    status: text("status", { enum: ["in_progress", "completed"] }).notNull(),
    result: text("result", { enum: ["player", "bot", "draw"] }),
    moves: integer("moves").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("battles_user_updated_idx").on(table.userId, table.updatedAt),
    check("battle_revision_positive", sql`${table.revision} > 0`),
    check(
      "battle_valid_json",
      sql`json_valid(${table.replay}) AND json_valid(${table.catalog})`,
    ),
    check("battle_moves_range", sql`${table.moves} BETWEEN 0 AND 60`),
  ],
);
