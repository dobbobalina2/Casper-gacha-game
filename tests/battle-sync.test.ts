import { test } from "node:test";
import assert from "node:assert/strict";
import { saveWithRecovery } from "../src/client/battle-sync.ts";
import type { Replay } from "../src/shared/contracts/battles.ts";

const replay: Replay = {
  version: "arena-v3",
  catalogRevision: "a".repeat(64),
  playerIds: ["a", "b", "c"],
  botIds: ["d", "e", "f"],
  actions: [{ type: "charge" }, { type: "charge" }],
};
const conflict = () => Object.assign(new Error("Newer save"), { status: 409 });

test("lost acknowledgement recovers the server revision without losing later local moves", async () => {
  const revisions: number[] = [];
  const result = await saveWithRecovery(
    { revision: 1, replay },
    {
      put: async (revision) => {
        revisions.push(revision);
        if (revision === 1) throw conflict();
        return { revision: 3 };
      },
      get: async () => ({
        revision: 2,
        replay: { ...replay, actions: replay.actions.slice(0, 1) },
      }),
    },
  );
  assert.deepEqual(revisions, [1, 2]);
  assert.equal(result.revision, 3);
});
test("different histories, changed catalogs and newer remote moves never rebase", async () => {
  const remotes: Replay[] = [
    { ...replay, actions: [{ type: "attack", fighter: "a", target: "d" }] },
    { ...replay, catalogRevision: "b".repeat(64) },
    { ...replay, playerIds: ["b", "a", "c"] },
    { ...replay, actions: [...replay.actions, { type: "charge" }] },
  ];
  for (const remote of remotes) {
    let writes = 0;
    await assert.rejects(
      saveWithRecovery(
        { revision: 1, replay },
        {
          put: async () => {
            writes++;
            throw conflict();
          },
          get: async () => ({ revision: 2, replay: remote }),
        },
      ),
      { status: 409 },
    );
    assert.equal(writes, 1);
  }
});
test("recovery is bounded and cannot bypass an account-change rejection", async () => {
  let writes = 0,
    reads = 0;
  await assert.rejects(
    saveWithRecovery(
      { revision: 1, replay },
      {
        put: async () => {
          writes++;
          throw conflict();
        },
        get: async () => {
          reads++;
          return { revision: 2, replay };
        },
      },
    ),
    { status: 409 },
  );
  assert.equal(writes, 2);
  assert.equal(reads, 1);
  writes = 0;
  await assert.rejects(
    saveWithRecovery(
      { revision: 1, replay },
      {
        put: async () => {
          writes++;
          throw conflict();
        },
        get: async () => {
          throw Object.assign(new Error("Account changed"), { status: 409 });
        },
      },
    ),
    { status: 409 },
  );
  assert.equal(writes, 1);
});
