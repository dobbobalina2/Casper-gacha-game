import type { Card } from "../contracts/catalog.ts";
import { specialFor, specialCost } from "./specials.ts";

export type Side = "player" | "bot";
export type Turn = Side | "system";
export type Fighter = Card & { hp: number; rest: number; specialUsed: boolean };
export type MatchSide = {
  energy: number;
  guarded: boolean;
  fighters: Fighter[];
};
export type MatchState = {
  version: typeof RULES.version;
  turn: Side;
  move: number;
  winner: Side | "draw" | null;
  player: MatchSide;
  bot: MatchSide;
  log: { move: number; side: Turn; text: string }[];
};
export type Action =
  | { type: "charge" }
  | { type: "attack"; fighter: string; target: string; support?: string | null }
  | { type: "special"; fighter: string; target: string };
export type ActionInput = unknown;
export type Replay = {
  version: typeof RULES.version;
  catalogRevision: string;
  playerIds: string[];
  botIds: string[];
  actions: Action[];
};
export type ReplayInput = {
  version: string;
  catalogRevision?: string;
  playerIds: string[];
  botIds: string[];
  actions: unknown[];
};

function isAction(value: unknown): value is Action {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "charge") return true;
  if (candidate.type !== "attack" && candidate.type !== "special") return false;
  return (
    typeof candidate.fighter === "string" &&
    typeof candidate.target === "string"
  );
}

export const RULES = Object.freeze({
  version: "arena-v3",
  teamSize: 3,
  budget: 14,
  hp: 100,
  maxEnergy: 6,
  initialEnergy: 4,
  turnLimit: 60,
});
export const attackCost = (card: Card) => Math.max(1, Math.ceil(card.cost / 3));
export const baseDamage = (card: Card) => 12 + Math.round(card.power / 1500);
export const teamCost = (cards: Card[]) =>
  cards.reduce((sum, c) => sum + c.cost, 0);

export function validateTeam(ids: unknown, catalog: Card[]): string | null {
  if (!Array.isArray(ids) || ids.length !== RULES.teamSize)
    return "Choose exactly three fighters.";
  if (new Set(ids).size !== ids.length)
    return "Choose three different card definitions.";
  if (
    ids.some(
      (id) =>
        !catalog.some(
          (c) =>
            c.id === id && c.type === "BATTLE" && c.family === "Fusion World",
        ),
    )
  )
    return "A fighter is not in the verified roster.";
  if (
    teamCost(ids.map((id) => catalog.find((c) => c.id === id)!)) > RULES.budget
  )
    return "Your team exceeds the 14-cost budget.";
  return null;
}

export function createMatch(
  playerIds: string[],
  botIds: string[],
  catalog: Card[],
): MatchState {
  for (const ids of [playerIds, botIds]) {
    const error = validateTeam(ids, catalog);
    if (error) throw new Error(error);
  }
  const side = (ids: string[]): MatchSide => ({
    energy: RULES.initialEnergy,
    guarded: false,
    fighters: ids.map((id) => ({
      ...structuredClone(catalog.find((c) => c.id === id)!),
      hp: RULES.hp,
      rest: 0,
      specialUsed: false,
    })),
  });
  return {
    version: RULES.version,
    turn: "player",
    move: 1,
    winner: null,
    player: side(playerIds),
    bot: side(botIds),
    log: [],
  };
}

export function actionError(
  state: MatchState,
  side: Side,
  action: ActionInput,
): string | null {
  if (state.winner) return "This match is over.";
  if (state.turn !== side) return "Wait for your turn.";
  if (!isAction(action)) return "Unknown action.";
  if (action.type === "charge") return null;
  const own = state[side],
    other = state[side === "player" ? "bot" : "player"];
  const fighter = own.fighters.find((f) => f.id === action.fighter);
  if (!fighter || fighter.hp <= 0 || fighter.rest > 0)
    return "Choose a ready fighter.";
  if (action.type === "special") {
    if (!specialFor(fighter)) return "This fighter has no special attack.";
    if (fighter.specialUsed) return "Special already used this match.";
    if ("support" in action && action.support != null)
      return "Special attacks cannot use combo support.";
  }
  const target = other.fighters.find((f) => f.id === action.target);
  if (!target || target.hp <= 0) return "Choose a standing opponent.";
  const supportId = "support" in action ? action.support : null;
  const support =
    supportId == null ? null : own.fighters.find((f) => f.id === supportId);
  if (
    supportId != null &&
    (!support ||
      support.id === fighter.id ||
      support.hp <= 0 ||
      support.rest > 0 ||
      !(support.comboPower !== null && support.comboPower > 0))
  )
    return "That fighter cannot support this attack.";
  if (
    own.energy <
    (action.type === "special"
      ? specialCost(fighter)
      : attackCost(fighter) + (support ? 1 : 0))
  )
    return "Not enough energy. Charge or choose a lighter attack.";
  return null;
}

export function damageFor(state: MatchState, side: Side, action: Action) {
  if (action.type === "charge") return 0;
  const fighter = state[side].fighters.find((f) => f.id === action.fighter)!;
  const supportId = action.type === "attack" ? action.support : null;
  const support = state[side].fighters.find((f) => f.id === supportId);
  const opponent = state[side === "player" ? "bot" : "player"];
  const special = action.type === "special" ? specialFor(fighter) : null;
  const target = opponent.fighters.find((f) => f.id === action.target)!;
  const bonus = special
    ? special.bonus +
      (special.rage && fighter.hp <= special.rageThreshold ? special.rage : 0) +
      (special.execute && target.hp <= special.executeThreshold
        ? special.execute
        : 0)
    : 0;
  const raw = Math.max(
    1,
    baseDamage(fighter) +
      bonus +
      (support?.comboPower ? support.comboPower / 1000 : 0),
  );
  return Math.max(
    1,
    Math.floor(raw * (opponent.guarded && !special?.pierce ? 0.75 : 1)),
  );
}

// All state transitions are synchronous and deterministic; the UI only schedules the bot's turn.
export function applyAction(
  state: MatchState,
  side: Side,
  action: ActionInput,
): MatchState {
  const error = actionError(state, side, action);
  if (error) throw new Error(error);
  if (!isAction(action)) throw new Error("Unknown action.");
  const next = structuredClone(state),
    own = next[side],
    enemySide = side === "player" ? "bot" : "player",
    enemy = next[enemySide];
  let text;
  if (action.type === "charge") {
    const gained = Math.min(3, RULES.maxEnergy - own.energy);
    own.energy += gained;
    own.guarded = true;
    text = `${side === "player" ? "You" : "The bot"} charged +${gained} energy and guarded the next hit.`;
  } else {
    const fighter = own.fighters.find((f) => f.id === action.fighter)!,
      target = enemy.fighters.find((f) => f.id === action.target)!,
      supportId = action.type === "attack" ? action.support : null,
      support = own.fighters.find((f) => f.id === supportId);
    const damage = damageFor(next, side, action),
      guarded = enemy.guarded;
    target.hp = Math.max(0, target.hp - damage);
    const special = action.type === "special" ? specialFor(fighter) : null;
    own.energy -= special
      ? specialCost(fighter)
      : attackCost(fighter) + (support ? 1 : 0);
    let extra = "";
    if (special) {
      fighter.specialUsed = true;
      if (special.splash) {
        for (const f of enemy.fighters) {
          if (f.id !== target.id && f.hp > 0)
            f.hp = Math.max(
              0,
              f.hp -
                Math.max(1, Math.floor(special.splash * (guarded ? 0.75 : 1))),
            );
        }
        extra += ` Splash hits the other enemies.`;
      }
      if (special.refund) {
        const gained = Math.min(special.refund, RULES.maxEnergy - own.energy);
        own.energy += gained;
        extra += ` Restored ${gained} energy.`;
      }
      if (special.guard) {
        own.guarded = true;
        extra += " Team guarded.";
      }
      if (special.drain) {
        const drained = Math.min(enemy.energy, special.drain);
        enemy.energy -= drained;
        extra += ` Drained ${drained} enemy energy.`;
      }
    }
    fighter.rest = 2;
    if (support) support.rest = 2;
    enemy.guarded = false;
    text = `${fighter.name}${special ? ` used ${special.name} and` : ""}${support ? ` + ${support.name}` : ""} hit ${target.name} for ${damage}${guarded ? (special?.pierce ? " ignoring guard" : " through guard") : ""}.${target.hp === 0 ? " Knockout!" : ""}${extra}`;
  }
  next.log.push({ move: state.move, side, text });
  if (enemy.fighters.every((f) => f.hp === 0)) next.winner = side;
  else if (next.move >= RULES.turnLimit) {
    const hp = (s: Side) => next[s].fighters.reduce((sum, f) => sum + f.hp, 0);
    next.winner =
      hp("player") === hp("bot")
        ? "draw"
        : hp("player") > hp("bot")
          ? "player"
          : "bot";
    next.log.push({
      move: state.move,
      side: "system",
      text: "Turn limit reached. Remaining team health decides the result.",
    });
  }
  if (!next.winner) {
    next.turn = enemySide;
    next.move++;
    enemy.energy = Math.min(RULES.maxEnergy, enemy.energy + 2);
    const lastStanding = enemy.fighters.filter((f) => f.hp > 0).length === 1;
    enemy.fighters.forEach((f) => {
      f.rest = lastStanding ? 0 : Math.max(0, f.rest - 1);
    });
  }
  return next;
}

export function chooseBotAction(state: MatchState, side: Side = "bot"): Action {
  const own = state[side],
    enemy = state[side === "bot" ? "player" : "bot"];
  const choices: { action: Action; score: number }[] = [];
  for (const fighter of own.fighters)
    for (const target of enemy.fighters)
      for (const support of [
        null,
        ...own.fighters.filter(
          (f) => f.comboPower !== null && f.comboPower > 0,
        ),
      ]) {
        const action: Action = {
          type: "attack",
          fighter: fighter.id,
          target: target.id,
          support: support?.id ?? null,
        };
        if (actionError(state, side, action)) continue;
        const damage = damageFor(state, side, action);
        // Prioritize knockouts and focused damage, but avoid wasting support on an already lethal hit.
        const score =
          Math.min(target.hp, damage) +
          (damage >= target.hp ? 60 : 0) +
          (100 - target.hp) * 0.15 -
          (support ? 2 : 0) -
          attackCost(fighter) * 0.2;
        choices.push({ action, score });
      }
  for (const fighter of own.fighters)
    for (const target of enemy.fighters) {
      const action: Action = {
        type: "special",
        fighter: fighter.id,
        target: target.id,
      };
      if (actionError(state, side, action)) continue;
      const special = specialFor(fighter)!,
        damage = damageFor(state, side, action);
      const splash = enemy.fighters
        .filter((f) => f.hp > 0 && f !== target)
        .reduce((sum, f) => {
          const amount = Math.floor(
            (special.splash || 0) * (enemy.guarded ? 0.75 : 1),
          );
          return sum + Math.min(f.hp, amount) + (amount >= f.hp ? 60 : 0);
        }, 0);
      const score =
        Math.min(target.hp, damage) +
        (damage >= target.hp ? 60 : 0) +
        (100 - target.hp) * 0.15 +
        splash +
        (special.guard && !own.guarded ? 5 : 0) +
        (special.drain ? Math.min(enemy.energy, special.drain) * 2 : 0) -
        specialCost(fighter) * 0.2 -
        4;
      choices.push({ action, score });
    }
  choices.sort((a, b) => b.score - a.score);
  return choices[0]?.action ?? { type: "charge" };
}

export function restoreMatch(
  saved: ReplayInput,
  catalog: Card[],
  catalogRevision?: string,
): MatchState {
  if (
    catalogRevision !== undefined &&
    saved.catalogRevision !== catalogRevision
  )
    throw new Error("Card catalog changed. Start a fresh match.");
  if (saved.version !== RULES.version || saved.actions.length > RULES.turnLimit)
    throw new Error("Incompatible practice save.");
  let state = createMatch(saved.playerIds, saved.botIds, catalog);
  for (const action of saved.actions)
    state = applyAction(state, state.turn, action);
  return state;
}
