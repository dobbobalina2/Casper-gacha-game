import { seedCards } from "../scripts/lib/seed-catalog.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { specialFor } from "../src/shared/specials.ts";
import { createEffects, type CombatEvent } from "../src/client/effects.ts";

type FakeAnimation = {
  finished: Promise<void>;
  frames: Keyframe[];
  cancelled?: boolean;
  cancel(): void;
  finish(): void;
};
type FakeElement = {
  dataset: Record<string, string>;
  style: Record<string, string>;
  children: FakeElement[];
  handlers: Record<string, () => void>;
  removed?: boolean;
  setAttribute(): void;
  addEventListener(name: string, fn: () => void): void;
  append(el: FakeElement): void;
  appendChild(el: FakeElement): void;
  remove(): void;
  getBoundingClientRect(): DOMRect;
  animate(frames: Keyframe[]): FakeAnimation;
};
function setup(
  t: import("node:test").TestContext,
  { reduced = false }: { reduced?: boolean } = {},
) {
  const old: Record<string, PropertyDescriptor | undefined> = {};
  for (const key of ["document", "window", "localStorage"])
    old[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  t.after(() => {
    for (const [key, descriptor] of Object.entries(old)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const animations: FakeAnimation[] = [],
    listeners: Record<string, () => void> = {},
    saved = new Map<string, string>(),
    oscillators: { started?: boolean }[] = [];
  function element(dataset: Record<string, string> = {}): FakeElement {
    return {
      dataset,
      style: {},
      children: [],
      handlers: {},
      setAttribute() {},
      addEventListener(name, fn) {
        this.handlers[name] = fn;
      },
      append(el) {
        this.children.push(el);
      },
      appendChild(el) {
        this.children.push(el);
      },
      remove() {
        this.removed = true;
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 100, height: 100 } as DOMRect;
      },
      animate(frames) {
        let end!: () => void;
        const finished = new Promise<void>((resolve) => (end = resolve));
        const a: FakeAnimation = {
          finished,
          frames,
          cancel() {
            a.cancelled = true;
            end();
          },
          finish() {
            end();
          },
        };
        animations.push(a);
        return a;
      },
    };
  }
  const player = element({ fighter: "a" }),
    target = element({ target: "b" }),
    button = element(),
    volume = element();
  const root = {
    append() {},
    appendChild() {},
    querySelectorAll(selector: string) {
      return selector === "[data-fighter]"
        ? [player]
        : selector === "[data-target]"
          ? [target]
          : [player];
    },
  };
  const param = () => ({
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {},
  });
  let contexts = 0;
  class FakeAudioContext {
    state = "suspended";
    currentTime = 0;
    destination = {};
    constructor() {
      contexts++;
    }
    async resume() {
      this.state = "running";
    }
    createGain() {
      return { gain: param(), connect() {}, disconnect() {} };
    }
    createOscillator() {
      const node: {
        frequency: ReturnType<typeof param>;
        connect(): void;
        disconnect(): void;
        started?: boolean;
        start(): void;
        stop(): void;
      } = {
        frequency: param(),
        connect() {},
        disconnect() {},
        start() {
          node.started = true;
        },
        stop() {},
      };
      oscillators.push(node);
      return node;
    }
  }
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      addEventListener(name: string, fn: () => void) {
        listeners[name] = fn;
      },
      createElement: () => element(),
      body: element(),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      AudioContext: FakeAudioContext,
      matchMedia: () => ({ matches: reduced }),
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => saved.get(k) || null,
      setItem: (k: string, v: string) => saved.set(k, v),
    },
  });
  const effects = createEffects({
    root: root as unknown as HTMLElement,
    soundButton: button as unknown as HTMLButtonElement,
    volumeInput: volume as unknown as HTMLInputElement,
  });
  return {
    effects,
    animations,
    listeners,
    button,
    volume,
    oscillators,
    saved,
    player,
    target,
    contexts: () => contexts,
  };
}
const hit: CombatEvent = {
  type: "attack",
  side: "player",
  fighter: "a",
  target: "b",
  damage: 29,
};
test("cancelled effect cannot remove or unlock a newer effect", async (t) => {
  const env = setup(t);
  const first = env.effects.play(hit);
  env.effects.cancel();
  const second = env.effects.play(hit);
  const current = env.animations.slice(-4);
  await first;
  assert.ok(current.every((a) => !a.cancelled));
  current.forEach((a) => a.finish());
  await second;
  assert.ok(current.every((a) => a.cancelled));
});
test("audio requires a gesture, mute persists, and reduced motion omits movement and beams", async (t) => {
  const env = setup(t, { reduced: true });
  const initial = env.effects.play(hit);
  assert.equal(env.contexts(), 0);
  assert.equal(env.animations.length, 1);
  assert.ok(env.animations[0].frames.every((f) => !f.transform));
  env.animations[0].finish();
  await initial;
  env.listeners.pointerdown();
  await Promise.resolve();
  assert.equal(env.contexts(), 1);
  assert.equal(env.button.dataset.audioState, "running");
  const audible = env.effects.play(hit);
  assert.equal(env.oscillators.length, 2);
  assert.ok(env.oscillators.every((n) => n.started));
  env.animations.at(-1)!.finish();
  await audible;
  env.button.handlers.click!();
  assert.equal(JSON.parse(env.saved.get("casper-audio-v1")!)?.enabled, false);
  const muted = env.effects.play(hit);
  assert.equal(env.oscillators.length, 2);
  env.animations.at(-1)!.finish();
  await muted;
});

test("all eight specials finish their distinct effects without stranding overlays", async (t) => {
  const env = setup(t);
  env.listeners.pointerdown();
  await Promise.resolve();
  for (const id of [
    "FB05-030",
    "SB02-043",
    "FB01-140",
    "FB06-120",
    "FB09-012",
    "FB05-119",
    "SB02-010",
    "FB02-061",
  ]) {
    const start = env.animations.length,
      sounds = env.oscillators.length;
    const special = specialFor(seedCards.find((card) => card.id === id)!);
    if (!special) throw new Error(`Missing special for ${id}`);
    const playing = env.effects.play({ ...hit, special });
    assert.ok(env.oscillators.length > sounds);
    const current = env.animations.slice(start);
    assert.ok(current.length >= 5);
    current.forEach((a) => a.finish());
    await playing;
    assert.ok(current.every((a) => a.cancelled));
  }
});
