import { z } from "zod";
import {
  collectibleImageSchema,
  inventorySourceSchema,
  mintSchema,
} from "./catalog.ts";

export const cursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[^\x00-\x1f]*$/);
export const inventoryQuerySchema = z.strictObject({
  code: z
    .enum(["dragonball_50", "dragonball_100", "dragonball_250"])
    .default("dragonball_50"),
  cursor: cursorSchema.optional(),
});

export const inventoryPageSchema = z
  .strictObject({
    items: z
      .array(
        z.strictObject({
          mint: mintSchema,
          name: z.string().min(1).max(250),
          description: z.string().max(1000),
          image: collectibleImageSchema.nullable(),
          rarity: z.enum(["common", "uncommon", "rare", "epic", "unknown"]),
        }),
      )
      .max(24),
    hasMore: z.boolean(),
    nextCursor: cursorSchema.nullable(),
    source: inventorySourceSchema,
    fetchedAt: z.iso.datetime(),
  })
  .refine((page) => page.hasMore === (page.nextCursor !== null), {
    message: "Continuation cursor must agree with hasMore",
  });

export type InventoryPage = z.infer<typeof inventoryPageSchema>;
