import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAccount,
  type AccountSnapshot,
  type LocalSave,
} from "../src/client/account.ts";
import { seedCards } from "../scripts/lib/seed-catalog.ts";
import type { Replay } from "../src/contracts/battles.ts";

class Storage {
  data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}
const replay: Replay = {
  version: "arena-v3",
  catalogRevision: "a".repeat(64),
  playerIds: ["FB05-030", "SB02-043", "FB01-140"],
  botIds: ["FB05-119", "SB02-043", "FB05-030"],
  actions: [],
};
function fixture(
  user: { id: string; name: string } | null = null,
  storage = new Storage(),
  session = new Storage(),
) {
  const snapshots: AccountSnapshot[] = [];
  const saved: unknown[] = [];
  const resumed: LocalSave[] = [];
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: session,
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: {
      search: "",
      origin: "http://127.0.0.1:4317",
      pathname: "/",
      assign() {},
    },
  });
  Object.defineProperty(globalThis, "history", {
    configurable: true,
    value: { replaceState() {} },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {} },
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (path: RequestInfo | URL, init?: RequestInit) => {
      const url = String(path);
      if (url === "/api/auth-status") return Response.json({ enabled: true });
      if (url === "/api/auth/get-session")
        return Response.json(user ? { user } : null);
      if (url === "/api/battles") return Response.json({ battles: [] });
      assert.equal(init?.method, "PUT");
      assert.equal(new Headers(init?.headers).get("X-Casper-User"), user?.id);
      const body = JSON.parse(String(init?.body)) as {
        revision: number;
        replay: typeof replay;
      };
      saved.push(body);
      return Response.json({
        id: url.split("/").at(-1),
        revision: body.revision + 1,
        status: "in_progress",
        result: null,
        moves: body.replay.actions.length,
        updatedAt: Date.now(),
        playerIds: body.replay.playerIds,
      });
    },
  });
  const account = createAccount({
    onChange: (state) => snapshots.push(state),
    notify() {},
    resume: (record) => resumed.push(record),
    clear() {},
  });
  return {
    account,
    snapshots,
    saved,
    resumed,
    storage,
    session,
    setFetch(fetcher: typeof fetch): void {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: fetcher,
      });
    },
  };
}

test("guest battle survives refresh and appears in observable local history", async () => {
  const first = fixture();
  await first.account.init();
  first.account.newBattle();
  first.account.save(replay, seedCards);
  assert.equal(first.saved.length, 0);
  const second = fixture(null, first.storage, first.session);
  await second.account.init();
  assert.equal(second.resumed.length, 1);
  assert.deepEqual(second.resumed[0].replay, replay);
  second.account.leave();
  await second.account.action("battles");
  assert.equal(second.snapshots.at(-1)?.history?.local.length, 2);
  assert.equal(second.snapshots.at(-1)?.history?.canImportGuest, false);
  assert.equal(second.storage.length, 2);
  second.account.dispose();
});

test("guest saves remain separate until an explicit import into a signed-in account", async () => {
  const guest = fixture();
  await guest.account.init();
  guest.account.newBattle();
  guest.account.save(replay, seedCards);
  const signed = fixture(
    { id: "alice", name: "Alice" },
    guest.storage,
    guest.session,
  );
  await signed.account.init();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(signed.saved.length, 0);
  assert.equal(signed.resumed.length, 0);
  await signed.account.action("battles");
  assert.equal(signed.snapshots.at(-1)?.history?.canImportGuest, true);
  await signed.account.action("import");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(signed.saved.length, 1);
  assert.equal(signed.resumed.length, 1);
  const owned = [...signed.storage.data.entries()].filter(([key]) =>
    key.startsWith("casper:save:alice:"),
  );
  assert.equal(owned.length, 1);
  assert.equal(JSON.parse(owned[0][1]).dirty, false);
  const other = fixture(
    { id: "bob", name: "Bob" },
    signed.storage,
    signed.session,
  );
  await other.account.init();
  await other.account.action("battles");
  assert.equal(other.saved.length, 0);
  assert.equal(other.resumed.length, 0);
  assert.equal(other.snapshots.at(-1)?.history?.local.length, 0);
  signed.account.dispose();
  other.account.dispose();
});

test("guest storage failure is visible and never claims a successful backup", async () => {
  const storage = new Storage();
  storage.setItem = () => {
    throw new Error("quota");
  };
  const app = fixture(null, storage);
  await app.account.init();
  app.account.newBattle();
  app.account.save(replay, seedCards);
  assert.match(app.snapshots.at(-1)?.status ?? "", /backup unavailable/);
  assert.equal(storage.length, 0);
  app.account.dispose();
});

test("disposing during account initialization does not start a session lookup or emit later snapshots", async () => {
  const app = fixture();
  let releaseStatus: ((response: Response) => void) | undefined;
  const statusResponse = new Promise<Response>((resolve) => {
    releaseStatus = resolve;
  });
  let calls = 0;
  app.setFetch(async () => {
    calls += 1;
    return statusResponse;
  });
  const initializing = app.account.init();
  app.account.dispose();
  releaseStatus?.(Response.json({ enabled: true }));
  await initializing;
  assert.equal(calls, 1);
  assert.equal(app.snapshots.length, 0);
});

test("disposing while an auth action is pending suppresses its late rejection", async () => {
  const app = fixture({ id: "alice", name: "Alice" });
  await app.account.init();
  let rejectRequest: ((error: Error) => void) | undefined;
  app.setFetch(async () => new Promise<Response>((_resolve, reject) => { rejectRequest = reject; }));
  const signOut = app.account.action("logout");
  await Promise.resolve();
  app.account.dispose();
  rejectRequest?.(new Error("connection closed"));
  await assert.doesNotReject(signOut);
});

test("the latest battle history refresh wins and closing invalidates pending refreshes", async () => {
  const app = fixture({ id: "alice", name: "Alice" });
  await app.account.init();
  const responses: Array<(response: Response) => void> = [];
  app.setFetch(
    async () =>
      new Promise<Response>((resolve) => {
        responses.push(resolve);
      }),
  );
  const first = app.account.action("battles");
  const second = app.account.action("battles");
  const summary = (battleId: string) => ({
    id: battleId,
    revision: 1,
    status: "in_progress",
    result: null,
    moves: 0,
    updatedAt: Date.now(),
    playerIds: replay.playerIds,
  });
  responses[1]?.(
    Response.json({
      battles: [summary("22222222-2222-4222-8222-222222222222")],
    }),
  );
  await second;
  responses[0]?.(
    Response.json({
      battles: [summary("33333333-3333-4333-8333-333333333333")],
    }),
  );
  await first;
  assert.equal(
    app.account.getSnapshot().history?.cloud[0]?.id,
    "22222222-2222-4222-8222-222222222222",
  );

  const pending = app.account.action("battles");
  app.account.closeHistory();
  responses[2]?.(
    Response.json({
      battles: [summary("44444444-4444-4444-8444-444444444444")],
    }),
  );
  await pending;
  assert.equal(app.account.getSnapshot().history, null);
  app.account.dispose();
});
