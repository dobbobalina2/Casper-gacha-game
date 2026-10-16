import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Special } from "../contracts/catalog.ts";
import type { InventoryPage } from "../contracts/inventory.ts";

export const collectibles = sqliteTable("collectibles", {
  mint: text("mint").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  image: text("image").notNull(),
  inventorySource: text("inventory_source").notNull(),
  observedAt: text("observed_at").notNull(),
  mapping: text("mapping").notNull(),
});

export const cardDefinitions = sqliteTable(
  "card_definitions",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    family: text("family").notNull(),
    type: text("type").notNull(),
    color: text("color").notNull(),
    cost: integer("cost").notNull(),
    power: integer("power").notNull(),
    comboPower: integer("combo_power"),
    statsSource: text("stats_source").notNull(),
    verifiedAt: text("verified_at").notNull(),
    image: text("image").notNull(),
    referenceMint: text("reference_mint")
      .notNull()
      .references(() => collectibles.mint),
    position: integer("position").notNull(),
  },
  (table) => [
    check("card_cost_range", sql`${table.cost} between 0 and 12`),
    check("card_power_range", sql`${table.power} between 1 and 100000`),
    check(
      "card_combo_range",
      sql`${table.comboPower} is null or ${table.comboPower} between 0 and 20000`,
    ),
    check(
      "card_family",
      sql`${table.family} = 'Fusion World' and ${table.type} = 'BATTLE'`,
    ),
  ],
);

export const specialAttacks = sqliteTable(
  "special_attacks",
  {
    cardId: text("card_id")
      .primaryKey()
      .references(() => cardDefinitions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    bonus: integer("bonus").notNull(),
    extraEnergy: integer("extra_energy").notNull(),
    pierce: integer("pierce", { mode: "boolean" }).notNull(),
    rage: integer("rage").notNull(),
    rageThreshold: integer("rage_threshold").notNull(),
    execute: integer("execute").notNull(),
    executeThreshold: integer("execute_threshold").notNull(),
    splash: integer("splash").notNull(),
    refund: integer("refund").notNull(),
    drain: integer("drain").notNull(),
    guard: integer("guard", { mode: "boolean" }).notNull(),
    visual: text("visual").notNull(),
    color: text("color").notNull(),
    notes: text("notes", { mode: "json" }).$type<Special["notes"]>().notNull(),
  },
  (table) => [
    check("special_bonus_range", sql`${table.bonus} between 0 and 100`),
    check("special_energy_range", sql`${table.extraEnergy} between 0 and 3`),
    check("special_notes_json", sql`json_valid(${table.notes})`),
  ],
);

// Bounded, expiring observations. Inventory does not grant playable status or ownership.
export const inventoryPages = sqliteTable(
  "inventory_pages",
  {
    source: text("source").primaryKey(),
    payload: text("payload", { mode: "json" }).$type<InventoryPage>().notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    check("inventory_payload_json", sql`json_valid(${table.payload})`),
  ],
);
