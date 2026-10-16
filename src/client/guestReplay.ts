import { z } from "zod";
import {
  RULES,
  restoreMatch,
  type MatchState,
  type Replay,
} from "../shared/engine.ts";
import type { Card } from "../contracts/catalog.ts";

const actionSchema = z.union([
  z.strictObject({ type: z.literal("charge") }),
  z.strictObject({
    type: z.literal("attack"),
    fighter: z.string(),
    target: z.string(),
    support: z.string().nullable().optional(),
  }),
  z.strictObject({
    type: z.literal("special"),
    fighter: z.string(),
    target: z.string(),
  }),
]);

export const guestReplaySchema = z.strictObject({
  version: z.literal(RULES.version),
  catalogRevision: z.string().regex(/^[a-f0-9]{64}$/),
  playerIds: z.array(z.string()).length(3),
  botIds: z.array(z.string()).length(3),
  actions: z.array(actionSchema).max(RULES.turnLimit),
});

export function restoreGuestReplay(
  replay: Replay,
  catalog: Card[],
  currentRevision: string,
): MatchState {
  return restoreMatch(replay, catalog, currentRevision);
}
