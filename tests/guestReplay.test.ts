import assert from "node:assert/strict";
import { test } from "node:test";
import { seedCards } from "../scripts/lib/seed-catalog.ts";
import { RULES, createMatch } from "../src/shared/engine.ts";
import { restoreGuestReplay } from "../src/client/guestReplay.ts";

const playerIds = ["FB05-030", "SB02-043", "FB09-012"];
const botIds = ["FB01-140", "SB02-043", "FB09-012"];
const savedRevision = "a".repeat(64);
const replay = {
  version: RULES.version,
  catalogRevision: savedRevision,
  playerIds,
  botIds,
  actions: [],
};

test("saved guest replay restores only against the current catalog revision", () => {
  assert.deepEqual(
    restoreGuestReplay(replay, seedCards, savedRevision),
    createMatch(playerIds, botIds, seedCards),
  );
  assert.throws(
    () => restoreGuestReplay(replay, seedCards, "b".repeat(64)),
    /catalog changed/,
  );
});
