import { test } from "node:test";
import assert from "node:assert/strict";
import { createEffects } from "../src/client/effects.ts";
import type { CombatEvent } from "../src/client/effects.ts";

function element() {
  const handlers = new Map<string, EventListenerOrEventListenerObject>();
  const value = {
    dataset: {} as DOMStringMap,
    style: {} as CSSStyleDeclaration,
    className: "",
    textContent: "",
    title: "",
    value: "35",
    appendChild() {},
    remove() {},
    setAttribute() {},
    addEventListener(
      name: string,
      listener: EventListenerOrEventListenerObject,
    ) {
      handlers.set(name, listener);
    },
    removeEventListener(name: string) {
      handlers.delete(name);
    },
    dispatch(name: string) {
      const listener = handlers.get(name);
      if (typeof listener === "function") listener(new Event(name));
    },
    getBoundingClientRect: () =>
      ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect,
    animate: () =>
      ({ finished: Promise.resolve(), cancel() {} }) as unknown as Animation,
  };
  return value;
}

test("charge effects render a reduced-motion energy cue and dispose listeners", async () => {
  const button = element(),
    volume = element(),
    fighter = element(),
    created: ReturnType<typeof element>[] = [];
  const root = { querySelectorAll: () => [fighter], appendChild() {} };
  const body = { appendChild() {} };
  const fakeDocument = {
    addEventListener() {},
    removeEventListener() {},
    createElement() {
      const node = element();
      created.push(node);
      return node;
    },
    body,
  };
  const fakeWindow = { matchMedia: () => ({ matches: true }) };
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document"),
    oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window"),
    oldStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: fakeDocument as unknown as Document,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow as unknown as Window,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => null, setItem() {} },
  });
  try {
    const effects = createEffects({
      root: root as unknown as HTMLElement,
      soundButton: button as unknown as HTMLButtonElement,
      volumeInput: volume as unknown as HTMLInputElement,
    });
    const event: CombatEvent = { type: "charge", side: "player", energy: 3 };
    await effects.play(event);
    assert.equal(created.length, 1);
    assert.equal(created[0]?.textContent, "+3 ENERGY");
    effects.dispose();
  } finally {
    for (const [key, value] of [
      ["document", oldDocument],
      ["window", oldWindow],
      ["localStorage", oldStorage],
    ] as const) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
