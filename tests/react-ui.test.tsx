import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { StrictMode, type RefObject } from "react";
import {
  render,
  fireEvent,
  waitFor,
  cleanup,
  act,
  renderHook,
} from "@testing-library/react";
import { App } from "../src/client/App.tsx";
import { useArena } from "../src/client/useArena.ts";
import { seedCards } from "../scripts/lib/seed-catalog.ts";
import type { Replay } from "../src/shared/contracts/battles.ts";
import type { createAccount } from "../src/client/account.ts";
import type { createEffects } from "../src/client/effects.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://127.0.0.1:4317/",
});
for (const name of [
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "location",
  "history",
  "HTMLElement",
  "HTMLDialogElement",
  "Element",
  "Node",
  "MutationObserver",
] as const) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: dom.window[name],
  });
}
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
});
Object.defineProperty(dom.window, "matchMedia", {
  value: () => ({ matches: true }),
});
Object.defineProperty(dom.window, "scrollTo", { value: () => {} });
Object.defineProperty(dom.window.Element.prototype, "animate", {
  value: () => ({ finished: Promise.resolve(), cancel() {} }),
});
Object.defineProperty(dom.window.HTMLDialogElement.prototype, "showModal", {
  value: function (this: HTMLDialogElement) {
    this.open = true;
  },
});
Object.defineProperty(dom.window.HTMLDialogElement.prototype, "close", {
  value: function (this: HTMLDialogElement) {
    this.open = false;
  },
});
const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  globalThis.fetch = originalFetch;
});
function backups() {
  return Array.from({ length: localStorage.length }, (_, i) =>
    localStorage.key(i)!,
  )
    .filter((key) => key.startsWith("casper:save:guest:"))
    .map((key) => JSON.parse(localStorage.getItem(key)!) as { replay: Replay });
}
test("React lobby, battle log, battle action and guest resume preserve the same replay", async () => {
  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path === "/api/catalog")
      return Response.json({ revision: "a".repeat(64), cards: seedCards });
    if (path === "/api/auth-status") return Response.json({ enabled: false });
    throw new Error(`Unexpected request ${path}`);
  };
  const view = render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  const start = await view.findByRole("button", { name: "Enter the arena ↗" });
  fireEvent.click(start);
  assert.match(view.container.textContent!, /YOUR MOVE/);
  assert.ok(view.getByText("BATTLE LOG"));
  assert.equal(
    view.queryByRole("button", { name: /(?:Show|Hide) battle log/ }),
    null,
  );
  fireEvent.click(view.getByRole("button", { name: "Kamehameha 2 energy" }));
  await waitFor(() => assert.equal(backups()[0].replay.actions.length, 2));
  assert.equal(backups()[0].replay.actions[0].type, "special");
  const saved = structuredClone(backups()[0].replay);
  view.unmount();
  const resumed = render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  await resumed.findByText("YOUR MOVE.");
  assert.match(resumed.container.textContent!, /TURN 3/);
  assert.deepEqual(backups().at(-1)?.replay, saved);
  fireEvent.click(resumed.getByRole("button", { name: "Leave match ↗" }));
  fireEvent.click(resumed.getByRole("button", { name: /^Leave match$/ }));
  await resumed.findByRole("button", { name: "Enter the arena ↗" });
  fireEvent.click(resumed.getByRole("button", { name: "My battles" }));
  await resumed.findByText("On this device");
  fireEvent.click(resumed.getAllByRole("button", { name: "Open ↗" })[0]);
  await resumed.findByText("YOUR MOVE.");
  assert.match(resumed.container.textContent!, /TURN 3/);
});

test("React battle hook locks rapid actions and ignores animation completion from an old match", async () => {
  const pending: Array<() => void> = [];
  const saved: Replay[] = [];
  const effects: RefObject<Pick<
    ReturnType<typeof createEffects>,
    "play" | "cancel"
  > | null> = {
    current: {
      play: () => new Promise<void>((resolve) => pending.push(resolve)),
      cancel() {},
    },
  };
  const accounts: RefObject<Pick<
    ReturnType<typeof createAccount>,
    "save" | "newBattle" | "leave"
  > | null> = {
    current: {
      save(replay) {
        if (replay) saved.push(structuredClone(replay));
      },
      newBattle() {},
      leave() {},
    },
  };
  const notify = () => {};
  const hook = renderHook(() => useArena(effects, accounts, notify));
  const start = () =>
    hook.result.current.start(
      ["FB05-030", "SB02-043", "FB01-140"],
      seedCards,
      "a".repeat(64),
    );
  act(start);
  act(() => {
    hook.result.current.commit({ type: "charge" });
    hook.result.current.commit({ type: "charge" });
  });
  assert.equal(saved.at(-1)?.actions.length, 1);
  assert.equal(hook.result.current.resolving, true);
  act(() => {
    hook.result.current.leave();
    start();
  });
  act(() => hook.result.current.commit({ type: "charge" }));
  await act(async () => pending[0]());
  assert.equal(hook.result.current.resolving, true);
  assert.equal(hook.result.current.session?.replay.actions.length, 1);
  await act(async () => pending[1]());
  assert.equal(hook.result.current.resolving, false);
  hook.unmount();
});

test("React inventory retries failures, paginates by cursor, and keeps browsing separate from playable cards", async () => {
  let inventoryCalls = 0;
  const item = {
    mint: seedCards[0].collectible.mint,
    name: "A different collectible",
    description: "Unverified collectible",
    image: null,
    rarity: "unknown",
  };
  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path === "/api/catalog")
      return Response.json({ revision: "b".repeat(64), cards: seedCards });
    if (path === "/api/auth-status") return Response.json({ enabled: false });
    const url = new URL(path);
    assert.equal(url.pathname, "/api/inventory");
    inventoryCalls++;
    if (inventoryCalls === 1)
      return new Response("Unavailable", { status: 503 });
    if (inventoryCalls === 2) {
      assert.equal(url.searchParams.get("cursor"), null);
      return Response.json({
        items: [item],
        hasMore: true,
        nextCursor: "page-two",
        source: "https://gacha.collectorcrypt.com/api/getNfts",
        fetchedAt: new Date().toISOString(),
      });
    }
    assert.equal(url.searchParams.get("cursor"), "page-two");
    return Response.json({
      items: [
        item,
        {
          ...item,
          mint: seedCards[1].collectible.mint,
          name: "Second collectible",
        },
      ],
      hasMore: false,
      nextCursor: null,
      source: "https://gacha.collectorcrypt.com/api/getNfts",
      fetchedAt: new Date().toISOString(),
    });
  };
  const view = render(<App />);
  fireEvent.click(
    await view.findByRole("button", { name: "Load Collector Crypt cards ↗" }),
  );
  fireEvent.click(
    await view.findByRole("button", { name: "Retry loading cards ↗" }),
  );
  await view.findByText("A different collectible");
  fireEvent.click(view.getByRole("button", { name: "Load more cards ↗" }));
  await view.findByText("Second collectible");
  assert.equal(view.getAllByText("A different collectible").length, 1);
  assert.equal(view.container.querySelectorAll(".inventory-card").length, 2);
  assert.equal(view.container.querySelectorAll(".roster-card").length, 8);
  assert.match(
    view.getByText("You have reached the end of this inventory pool.")
      .textContent!,
    /end/,
  );
  const link =
    view.container.querySelector<HTMLAnchorElement>(".inventory-card a")!;
  assert.equal(
    link.href,
    `https://collectorcrypt.com/assets/solana/${item.mint}`,
  );
  assert.equal(link.rel, "noopener noreferrer");
});
