import { test } from "node:test";
import assert from "node:assert/strict";
import { createSaveQueue, type SaveRecord } from "../src/client/save-queue.ts";
import { seedCards } from "../scripts/lib/seed-catalog.ts";
import type { Replay } from "../src/shared/contracts/battles.ts";

const replay = (actions: Replay["actions"] = []): Replay => ({
  version: "arena-v3",
  catalogRevision: "a".repeat(64),
  playerIds: ["FB05-030", "SB02-043", "FB01-140"],
  botIds: ["FB05-119", "SB02-043", "FB05-030"],
  actions,
});
const record = (
  localId = "local",
  actions: Replay["actions"] = [],
): SaveRecord => ({
  id: "11111111-1111-4111-8111-111111111111",
  localId,
  revision: 0,
  replay: replay(actions),
  catalog: seedCards,
  updatedAt: 1000,
  dirty: true,
});
const charge = replay([{ type: "charge" }]);
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("late acknowledgements preserve and save newer moves with the new revision", async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sent: SaveRecord[] = [];
  const stored: SaveRecord[] = [];
  const queue = createSaveQueue({
    persist: (item) => stored.push(structuredClone(item)),
    send: async (item) => {
      sent.push(item);
      if (sent.length === 1) await gate;
      return { revision: sent.length };
    },
  });
  queue.enqueue(record());
  queue.enqueue({ ...record(), replay: charge });
  release?.();
  await queue.flush();
  assert.equal(sent.length, 2);
  assert.equal(sent[1]?.revision, 1);
  assert.equal(stored.at(-1)?.revision, 2);
  assert.equal(stored.at(-1)?.dirty, false);
  assert.equal(stored.at(-1)?.replay.actions.length, 1);
});
test("offline writes stay durable and retry; conflicts stay retained without overwriting", async () => {
  let failure: (Error & { status: number }) | null = Object.assign(
    new Error("offline"),
    { status: 503 },
  );
  let last: SaveRecord | undefined;
  const queue = createSaveQueue({
    persist: (item) => {
      last = structuredClone(item);
    },
    send: async () => {
      if (failure) throw failure;
      return { revision: 1 };
    },
  });
  queue.enqueue(record());
  await queue.flush();
  assert.equal(last?.dirty, true);
  failure = null;
  await queue.flush();
  assert.equal(last?.dirty, false);
  failure = Object.assign(new Error("conflict"), { status: 409 });
  queue.enqueue(record("local", charge.actions));
  await queue.flush();
  assert.equal(last?.dirty, true);
  assert.equal(last?.blocked, true);
  failure = null;
  await queue.flush();
  assert.equal(last?.blocked, true);
  await queue.retry();
  assert.equal(last?.blocked, false);
  assert.equal(last?.dirty, false);
});
test("stopping an account queue prevents queued moves being sent after identity changes", async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  let last: SaveRecord | undefined;
  const queue = createSaveQueue({
    persist: (item) => {
      last = structuredClone(item);
    },
    send: async () => {
      calls += 1;
      await gate;
      return { revision: 1 };
    },
  });
  queue.enqueue(record());
  queue.enqueue({ ...record(), replay: charge });
  queue.stop();
  release?.();
  await queue.flush();
  await settle();
  assert.equal(calls, 1);
  assert.equal(last?.dirty, true);
  assert.equal(last?.revision, 1);
});
test("429 cooldown coalesces moves and retries once; stopping cancels the timer", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  let calls = 0;
  let stored: SaveRecord | undefined;
  const queue = createSaveQueue({
    persist: (item) => {
      stored = structuredClone(item);
    },
    send: async () => {
      calls += 1;
      if (calls === 1)
        throw Object.assign(new Error("wait"), {
          status: 429,
          retryAfterMs: 60000,
        });
      return { revision: 1 };
    },
  });
  queue.enqueue(record());
  await queue.flush();
  queue.enqueue({ ...record(), replay: charge });
  await queue.retry();
  assert.equal(calls, 1);
  assert.equal(stored?.dirty, true);
  assert.equal(stored?.replay.actions.length, 1);
  t.mock.timers.tick(60000);
  await queue.flush();
  assert.equal(calls, 2);
  assert.equal(stored?.dirty, false);
  const stopped = createSaveQueue({
    persist: () => {},
    send: async () => {
      calls += 1;
      throw Object.assign(new Error("wait"), {
        status: 429,
        retryAfterMs: 60000,
      });
    },
  });
  stopped.enqueue(record());
  await stopped.flush();
  stopped.stop();
  t.mock.timers.tick(60000);
  await stopped.flush();
  assert.equal(calls, 3);
});
test("a full-storage new battle does not block existing cloud saves", async () => {
  const sent: string[] = [];
  const stored = new Map<string, SaveRecord>();
  const queue = createSaveQueue({
    persist: (item) => stored.set(item.localId, structuredClone(item)),
    send: async (item) => {
      sent.push(item.localId);
      if (item.localId === "new")
        throw Object.assign(new Error("full"), { status: 507 });
      return { revision: item.revision + 1 };
    },
  });
  queue.enqueue(record("new"));
  queue.enqueue({ ...record("existing"), revision: 1 });
  await queue.flush();
  assert.deepEqual(sent, ["new", "existing"]);
  assert.equal(stored.get("new")?.dirty, true);
  assert.equal(stored.get("existing")?.dirty, false);
  queue.enqueue({ ...record("new", charge.actions) });
  queue.enqueue({ ...record("existing", charge.actions), revision: 2 });
  await queue.flush();
  assert.deepEqual(sent, ["new", "existing", "existing"]);
  assert.equal(stored.get("new")?.replay.actions.length, 1);
  await queue.retry();
  assert.deepEqual(sent, ["new", "existing", "existing", "new"]);
});
test("a quota response cannot hide a failed browser backup", async () => {
  const statuses: string[] = [];
  const queue = createSaveQueue({
    persist: () => {
      throw new Error("browser storage full");
    },
    onStatus: (message) => statuses.push(message),
    send: async () => {
      throw Object.assign(new Error("backed up"), { status: 507 });
    },
  });
  queue.enqueue(record());
  await queue.flush();
  assert.match(statuses.at(-1) ?? "", /Browser backup unavailable/);
});
