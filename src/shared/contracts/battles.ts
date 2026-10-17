import { z } from "zod";
import { cardIdSchema, catalogSchema } from "./catalog.ts";

const team = z
  .array(cardIdSchema)
  .length(3)
  .refine((ids) => new Set(ids).size === 3);
const action = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("charge") }),
  z.strictObject({
    type: z.literal("attack"),
    fighter: cardIdSchema,
    target: cardIdSchema,
    support: cardIdSchema.nullable().optional(),
  }),
  z.strictObject({
    type: z.literal("special"),
    fighter: cardIdSchema,
    target: cardIdSchema,
  }),
]);
export const replaySchema = z.strictObject({
  version: z.literal("arena-v3"),
  catalogRevision: z.string().regex(/^[a-f0-9]{64}$/),
  playerIds: team,
  botIds: team,
  actions: z.array(action).max(60),
});
export const saveBattleSchema = z.strictObject({
  revision: z.number().int().min(0).max(1000),
  replay: replaySchema,
});
export const battleIdSchema = z.uuid();
export const battleSummarySchema = z.strictObject({
  id: battleIdSchema,
  revision: z.number().int().positive(),
  status: z.enum(["in_progress", "completed"]),
  result: z.enum(["player", "bot", "draw"]).nullable(),
  moves: z.number().int().min(0).max(60),
  updatedAt: z.number().int(),
  playerIds: team,
});
export const battleSchema = battleSummarySchema.extend({
  replay: replaySchema,
  catalog: catalogSchema,
});
export const battleListSchema = z.strictObject({
  battles: z.array(battleSummarySchema).max(20),
});
export type Replay = z.infer<typeof replaySchema>;
