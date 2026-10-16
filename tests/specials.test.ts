import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createMatch,
  applyAction,
  actionError,
  damageFor,
  restoreMatch,
  RULES,
} from "../src/shared/engine.ts";
import type { Card, Replay } from "../src/shared/types.ts";
import { specialFor, specialCost } from "../src/shared/specials.ts";
const cards = JSON.parse(
  readFileSync(new URL("../public/cards.json", import.meta.url), "utf8"),
) as Card[];
const bot: string[] = ["FB05-030", "SB02-043", "FB09-012"];
const teamFor = (id: string) =>
  [id, ...bot.filter((c) => c !== id)].slice(0, 3);
function setup(id: string) {
  const ids =
    id === "FB06-120"
      ? ["FB06-120", "SB02-043", "FB09-012"]
      : id === "FB01-140" || id === "FB05-119"
        ? [id, "FB05-030", "FB09-012"]
        : teamFor(id);
  const state = createMatch(ids, bot, cards);
  state.player.energy = 6;
  return {
    state,
    action: {
      type: "special",
      fighter: id,
      target: "FB05-030",
    } as import("../src/shared/engine.ts").Action,
  };
}
test("each playable card has a distinct special presentation and positive cost", () => {
  assert.equal(
    new Set(cards.map((c) => specialFor(c)!.name)).size,
    cards.length,
  );
  assert.equal(
    new Set(cards.map((c) => specialFor(c)!.visual)).size,
    cards.length,
  );
  assert.equal(
    new Set(cards.map((c) => JSON.stringify(specialFor(c)!.notes))).size,
    cards.length,
  );
  for (const c of cards) assert.ok(specialCost(c) > 0 && specialCost(c) <= 6);
});
test("specials use energy, rest, reject support, and can only be used once", () => {
  for (const c of cards) {
    const { state, action } = setup(c.id),
      original = structuredClone(state);
    assert.match(
      actionError(state, "player", {
        ...action,
        support: state.player.fighters[1]!.id,
      })!,
      /cannot use combo/,
    );
    const next = applyAction(state, "player", action);
    assert.deepEqual(state, original);
    assert.equal(next.player.fighters[0].specialUsed, true);
    assert.equal(next.player.fighters[0].rest, 2);
    next.turn = "player";
    next.player.fighters[0].rest = 0;
    assert.match(actionError(next, "player", action)!, /already used/);
    state.player.energy = specialCost(c) - 1;
    assert.match(actionError(state, "player", action)!, /energy/);
  }
});
test("Piccolo ignores guard while Kamehameha remains reduced", () => {
  const p = setup("SB02-043");
  p.state.bot.guarded = true;
  assert.equal(damageFor(p.state, "player", p.action), 39);
  const g = setup("FB05-030");
  g.state.bot.guarded = true;
  assert.equal(damageFor(g.state, "player", g.action), 33);
  assert.equal(applyAction(p.state, "player", p.action).bot.guarded, false);
});
test("Gohan rage and Trunks finisher activate exactly at their thresholds", () => {
  const g = setup("FB01-140");
  g.state.player.fighters[0]!.hp = 51;
  assert.equal(damageFor(g.state, "player", g.action), 57);
  g.state.player.fighters[0]!.hp = 50;
  assert.equal(damageFor(g.state, "player", g.action), 75);
  const t = setup("SB02-010");
  t.state.bot.fighters[0]!.hp = 41;
  assert.equal(damageFor(t.state, "player", t.action), 27);
  t.state.bot.fighters[0]!.hp = 40;
  assert.equal(damageFor(t.state, "player", t.action), 45);
});
test("area specials respect guard on splash, clamp HP and win on a multi-knockout", () => {
  for (const [id, splash] of [
    ["FB06-120", 12],
    ["FB05-119", 6],
  ] as [string, number][]) {
    const { state, action } = setup(id);
    state.bot.guarded = true;
    state.bot.fighters[2]!.hp = 0;
    const result = applyAction(state, "player", action);
    assert.equal(result.bot.fighters[1].hp, 100 - Math.floor(splash * 0.75));
    assert.equal(result.bot.fighters[2].hp, 0);
    state.bot.fighters.forEach((c) => (c.hp = 1));
    assert.equal(applyAction(state, "player", action).winner, "player");
  }
});
test("Cheelai refunds energy and guards; Vegito drain is capped before turn regeneration", () => {
  const c = setup("FB09-012");
  c.state.player.energy = 2;
  const next = applyAction(c.state, "player", c.action);
  assert.equal(next.player.energy, 2);
  assert.equal(next.player.guarded, true);
  const v = setup("FB02-061");
  v.state.bot.energy = 1;
  assert.equal(applyAction(v.state, "player", v.action).bot.energy, 2);
});
test("special-use history replays exactly and old rules reject safely", () => {
  const ids = ["FB05-030", "SB02-043", "FB01-140"],
    actions: import("../src/shared/engine.ts").Action[] = [
      { type: "special", fighter: "FB05-030", target: "FB05-030" },
      { type: "charge" },
    ];
  let state = createMatch(ids, bot, cards);
  for (const action of actions) state = applyAction(state, state.turn, action);
  const save: Replay = {
    version: RULES.version,
    playerIds: ids,
    botIds: bot,
    actions,
  };
  assert.deepEqual(restoreMatch(save, cards), state);
  assert.throws(() => restoreMatch({ ...save, version: "arena-v2" }, cards));
});
