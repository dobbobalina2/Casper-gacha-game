import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  RULES,
  attackCost,
  validateTeam,
  createMatch,
  applyAction,
  actionError,
  damageFor,
  chooseBotAction,
  restoreMatch,
} from "../src/shared/engine.ts";
import type { Card, Replay } from "../src/shared/types.ts";
const cards = JSON.parse(
  readFileSync(new URL("../public/cards.json", import.meta.url), "utf8"),
) as Card[];
const team: string[] = ["FB05-030", "SB02-043", "FB09-012"];
const bot: string[] = ["FB01-140", "SB02-043", "FB09-012"];
const create = () => createMatch(team, bot, cards);
const strike: import("../src/shared/engine.ts").Action = {
  type: "attack",
  fighter: "FB05-030",
  target: "FB01-140",
  support: "FB09-012",
};

test("roster has exact card identities, stats sources, null combos and local images", () => {
  assert.equal(cards.length, 6);
  assert.equal(new Set(cards.map((c) => c.id)).size, 6);
  for (const c of cards) {
    assert.equal(c.family, "Fusion World");
    assert.equal(c.type, "BATTLE");
    assert.ok(c.statsSource.includes(`card_no=${c.id}`));
    assert.ok(c.collectible.mint);
    assert.ok(existsSync(new URL("../public" + c.image, import.meta.url)));
    assert.ok(c.power > 0);
    assert.ok(c.comboPower === null || c.comboPower > 0);
  }
  assert.equal(cards.find((c) => c.id === "SB02-043")!.power, 25000);
  assert.equal(cards.find((c) => c.id === "FB01-140")!.comboPower, null);
});
test("teams reject duplicates, unknown cards, wrong count and overspending", () => {
  assert.equal(validateTeam(team, cards), null);
  for (const ids of [
    [],
    [...team, "FB01-140"],
    ["FB05-030", "FB05-030", "SB02-043"],
    ["unknown", ...team.slice(1)],
    ["FB06-120", "FB01-140", "FB09-012"],
  ])
    assert.ok(validateTeam(ids, cards));
});
test("combo uses printed power, consumes energy, rests both cards and does not mutate input", () => {
  const state = create(),
    original = structuredClone(state),
    next = applyAction(state, "player", strike);
  assert.deepEqual(state, original);
  assert.equal(next.bot.fighters[0].hp, 61);
  assert.equal(next.player.energy, 2);
  assert.equal(next.player.fighters[0].rest, 2);
  assert.equal(next.player.fighters[2].rest, 2);
  assert.equal(next.turn, "bot");
  const returned = applyAction(next, "bot", { type: "charge" });
  assert.equal(returned.player.energy, 4);
  assert.equal(returned.player.fighters[0].rest, 1);
  assert.match(
    actionError(returned, "player", { ...strike, support: null })!,
    /ready/,
  );
  const rotate = applyAction(returned, "player", {
    type: "attack",
    fighter: "SB02-043",
    target: "FB01-140",
  });
  const again = applyAction(rotate, "bot", { type: "charge" });
  assert.equal(again.player.fighters[0].rest, 0);
});
test("guard reduces only the next hit and energy is capped", () => {
  let state = applyAction(create(), "player", { type: "charge" });
  assert.equal(state.player.energy, 6);
  const action: import("../src/shared/engine.ts").Action = {
    type: "attack",
    fighter: "FB01-140",
    target: "FB05-030",
  };
  assert.equal(damageFor(state, "bot", action), 33);
  state = applyAction(state, "bot", action);
  assert.equal(state.player.fighters[0].hp, 67);
  assert.equal(state.player.guarded, false);
  assert.equal(state.player.energy, 6);
});
test("illegal turns, targets, supports and insufficient energy are rejected without mutation", () => {
  const state = create();
  const original = structuredClone(state);
  const invalid: import("../src/shared/engine.ts").ActionInput[] = [
    { ...strike, support: "FB05-030" },
    { ...strike, support: "missing" },
    { ...strike, target: "missing" },
    { ...strike, fighter: "missing" },
    { type: "unknown" },
    { type: "special", fighter: "FB05-030", target: "FB01-140" },
  ];
  for (const action of invalid)
    assert.throws(() => applyAction(state, "player", action));
  assert.throws(() => applyAction(state, "bot", { type: "charge" }));
  assert.deepEqual(state, original);
  state.player.energy = 0;
  assert.match(actionError(state, "player", strike)!, /energy/);
  state.player.energy = 6;
  state.bot.fighters[0]!.hp = 0;
  assert.match(actionError(state, "player", strike)!, /standing/);
  const noCombo = createMatch(bot, team, cards);
  assert.match(
    actionError(noCombo, "player", {
      type: "attack",
      fighter: "SB02-043",
      target: "FB05-030",
      support: "FB01-140",
    })!,
    /support/,
  );
});
test("knockout ends match, clamps health and prevents further moves", () => {
  const state = create();
  state.bot.fighters.forEach((f) => (f.hp = 0));
  state.bot.fighters[0]!.hp = 1;
  const next = applyAction(state, "player", strike);
  assert.equal(next.bot.fighters[0].hp, 0);
  assert.equal(next.winner, "player");
  assert.throws(() => applyAction(next, "player", { type: "charge" }));
});
test("turn limit resolves ties instead of allowing endless charge loops", () => {
  let state = create();
  for (let i = 0; i < RULES.turnLimit; i++)
    state = applyAction(state, state.turn, { type: "charge" });
  assert.equal(state.winner, "draw");
  assert.equal(state.move, 60);
});
test("saved actions replay exactly; malformed saves fail closed", () => {
  const actions: import("../src/shared/engine.ts").Action[] = [
    strike,
    { type: "charge" },
    { type: "charge" },
  ];
  let state = create();
  for (const a of actions) state = applyAction(state, state.turn, a);
  const save: Replay = {
    version: RULES.version,
    playerIds: team,
    botIds: bot,
    actions,
  };
  assert.deepEqual(restoreMatch(save, cards), state);
  assert.throws(() => restoreMatch({ ...save, version: "old" }, cards));
  assert.throws(() =>
    restoreMatch({ ...save, actions: [null] as never }, cards),
  );
});
test("bot completes matches legally for every valid roster combination", () => {
  let count = 0;
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      for (let k = j + 1; k < cards.length; k++) {
        const ids = [cards[i]!.id, cards[j]!.id, cards[k]!.id];
        if (validateTeam(ids, cards)) continue;
        let state = createMatch(ids, bot, cards);
        while (!state.winner) {
          const action = chooseBotAction(state, state.turn);
          assert.equal(actionError(state, state.turn, action), null);
          state = applyAction(state, state.turn, action);
          for (const side of [
            "player",
            "bot",
          ] as import("../src/shared/engine.ts").Side[]) {
            assert.ok(state[side].energy >= 0 && state[side].energy <= 6);
            for (const f of state[side].fighters)
              assert.ok(f.hp >= 0 && f.hp <= 100);
          }
        }
        assert.ok(state.move <= 60);
        count++;
      }
  assert.equal(count, 9);
});

test("last surviving fighter recovers every own turn, including after a teammate knockout", () => {
  let state = create();
  state.player.fighters[1]!.hp = 0;
  state.player.fighters[2]!.hp = 1;
  state = applyAction(state, "player", { ...strike, support: null });
  state = applyAction(state, "bot", {
    type: "attack",
    fighter: "FB01-140",
    target: "FB09-012",
  });
  assert.equal(state.player.fighters[0].rest, 0);
  assert.equal(
    actionError(state, "player", { ...strike, support: null }),
    null,
  );
});
test("every ordered lineup pairing finishes by knockout within 32 turns", async () => {
  const { evaluate } = await import("../scripts/balance.ts");
  const result = evaluate();
  assert.equal(result.matches, 81);
  assert.equal(result.limitFinishes, 0);
  assert.ok(result.max! <= 32);
  assert.ok(result.median! <= 24);
  assert.ok(result.firstSeatWins / result.matches < 0.6);
  assert.ok(result.firstSeatWins / result.matches > 0.4);
});
