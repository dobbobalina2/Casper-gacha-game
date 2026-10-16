import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMatch } from "../src/shared/engine.ts";
import type { Card, Replay } from "../src/shared/types.ts";
import { commitMove, presentMove } from "../src/client/battleFlow.ts";
import type { CombatEvent } from "../src/client/effects.ts";

const cards = JSON.parse(
  readFileSync(new URL("../public/cards.json", import.meta.url), "utf8"),
) as Card[];
const player = ["FB05-030", "SB02-043", "FB01-140"];
const bot = ["FB05-119", "SB02-043", "FB05-030"];
const replay: Replay = {
  version: "arena-v2",
  playerIds: player,
  botIds: bot,
  actions: [],
};

test("legal actions persist and publish before asynchronous effects start", () => {
  const session = { match: createMatch(player, bot, cards), replay };
  const order: string[] = [];
  const move = commitMove(
    session,
    { type: "charge" },
    (next) => {
      order.push("save");
      assert.deepEqual(next.replay.actions, [{ type: "charge" }]);
      assert.equal(next.match.player.energy, 6);
    },
    (published) => {
      order.push("publish");
      assert.equal(published.session.match.turn, "bot");
    },
  );
  order.push("effects");
  assert.deepEqual(order, ["save", "publish", "effects"]);
  assert.equal(move.session.replay.actions.length, 1);
});

test("a stale animation completion cannot unlock a newer match", async () => {
  const deferred: { resolve?: () => void } = {};
  let generation = 1;
  let unlocks = 0;
  const pending = new Promise<void>((done) => {
    deferred.resolve = done;
  });
  const event: CombatEvent = { type: "charge", side: "player", energy: 2 };
  const finishing = presentMove(
    { play: async () => pending },
    event,
    0,
    () => generation,
    () => {
      unlocks++;
    },
  );
  generation++;
  deferred.resolve?.();
  await finishing;
  assert.equal(unlocks, 0);
});

test("effect failures release the current move lock without undoing the action", async () => {
  let unlocks = 0;
  const event: CombatEvent = { type: "charge", side: "player", energy: 2 };
  await presentMove(
    {
      play: async () => {
        throw new Error("animation failed");
      },
    },
    event,
    3,
    () => 3,
    () => {
      unlocks++;
    },
  );
  assert.equal(unlocks, 1);
});
