import { test } from "node:test";
import assert from "node:assert/strict";
import { createSaveQueue, type SaveRecord } from "../src/client/save-queue.ts";
import { seedCards } from "../scripts/lib/seed-catalog.ts";
import type { Replay } from "../src/contracts/battles.ts";
const replay = (actions: Replay["actions"] = []): Replay => ({
  version: "arena-v3", catalogRevision: "a".repeat(64),
  playerIds: ["FB05-030", "SB02-043", "FB01-140"],
  botIds: ["FB05-119", "SB02-043", "FB05-030"], actions,
});
const record = (actions: Replay["actions"] = []): SaveRecord => ({
  id: "11111111-1111-4111-8111-111111111111", localId: "local", revision: 0,
  replay: replay(actions), catalog: seedCards, updatedAt: 1000, dirty: true,
});
test("late acknowledgements retain later moves and advance the server revision", async () => {
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const sent: SaveRecord[] = [];
  const stored: SaveRecord[] = [];
  const queue = createSaveQueue({
    persist: (item) => stored.push(structuredClone(item)),
    send: async (item) => { sent.push(item); if (sent.length === 1) await pending; return { revision: sent.length }; },
  });
  queue.enqueue(record());
  queue.enqueue(record([{ type: "charge" }]));
  release?.();
  await queue.flush();
  assert.equal(sent.length, 2);
  assert.equal(sent[1]?.revision, 1);
  assert.equal(stored.at(-1)?.revision, 2);
  assert.equal(stored.at(-1)?.dirty, false);
  assert.equal(stored.at(-1)?.replay.actions.length, 1);
});
test("offline branches remain durable and can be flushed again", async () => {
  let offline = true;
  let stored: SaveRecord | undefined;
  const queue = createSaveQueue({
    persist: (item) => { stored = structuredClone(item); },
    send: async () => { if (offline) throw new Error("offline"); return { revision: 1 }; },
  });
  queue.enqueue(record());
  await queue.flush();
  assert.equal(stored?.dirty, true);
  offline = false;
  await queue.flush();
  assert.equal(stored?.dirty, false);
});
