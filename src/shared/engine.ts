import type { Card, Replay } from "./types.ts";

export type Side = "player" | "bot";
export type Turn = Side | "system";
export type Fighter = Card & { hp: number; rest: number };
export interface MatchSide {
  energy: number;
  guarded: boolean;
  fighters: Fighter[];
}
export interface MatchState {
  version: typeof RULES.version;
  turn: Side;
  move: number;
  winner: Side | "draw" | null;
  player: MatchSide;
  bot: MatchSide;
  log: { move: number; side: Turn; text: string }[];
}
export type Action =
  | { type: "charge" }
  | {
      type: "attack";
      fighter: string;
      target: string;
      support?: string | null;
    };
export type ActionInput = unknown;
export type ReplayInput = Omit<Replay, "catalogRevision">;

function isAction(value: unknown): value is Action {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "charge") return true;
  return (
    candidate.type === "attack" &&
    typeof candidate.fighter === "string" &&
    typeof candidate.target === "string" &&
    (candidate.support === undefined ||
      candidate.support === null ||
      typeof candidate.support === "string")
  );
}

export const RULES = Object.freeze({
  version: "arena-v2",
  teamSize: 3,
  budget: 14,
  hp: 100,
  maxEnergy: 6,
  initialEnergy: 4,
  turnLimit: 60,
});
export const attackCost = (card: Card): number =>
  Math.max(1, Math.ceil(card.cost / 3));
export const baseDamage = (card: Card): number =>
  12 + Math.round(card.power / 1500);
export const teamCost = (cards: Card[]): number =>
  cards.reduce((sum, card) => sum + card.cost, 0);

export function validateTeam(ids: unknown, catalog: Card[]): string | null {
  if (!Array.isArray(ids) || ids.length !== RULES.teamSize)
    return "Choose exactly three fighters.";
  if (new Set(ids).size !== ids.length)
    return "Choose three different card definitions.";
  if (
    ids.some(
      (id: unknown) =>
        !catalog.some(
          (card) =>
            card.id === id &&
            card.type === "BATTLE" &&
            card.family === "Fusion World",
        ),
    )
  )
    return "A fighter is not in the verified roster.";
  const selected = ids.map((id: string) =>
    catalog.find((card) => card.id === id)!,
  );
  if (teamCost(selected) > RULES.budget)
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
      ...structuredClone(catalog.find((card) => card.id === id)!),
      hp: RULES.hp,
      rest: 0,
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
  input: ActionInput,
): string | null {
  if (state.winner) return "This match is over.";
  if (state.turn !== side) return "Wait for your turn.";
  if (!isAction(input)) return "Unknown action.";
  if (input.type === "charge") return null;
  const own = state[side];
  const other = state[side === "player" ? "bot" : "player"];
  const fighter = own.fighters.find((entry) => entry.id === input.fighter);
  if (!fighter || fighter.hp <= 0 || fighter.rest > 0)
    return "Choose a ready fighter.";
  const target = other.fighters.find((entry) => entry.id === input.target);
  if (!target || target.hp <= 0) return "Choose a standing opponent.";
  const supportId = input.support ?? null;
  const support =
    supportId === null
      ? null
      : (own.fighters.find((entry) => entry.id === supportId) ?? null);
  if (
    supportId !== null &&
    (!support ||
      support.id === fighter.id ||
      support.hp <= 0 ||
      support.rest > 0 ||
      support.comboPower === null ||
      support.comboPower <= 0)
  )
    return "That fighter cannot support this attack.";
  if (own.energy < attackCost(fighter) + (support ? 1 : 0))
    return "Not enough energy. Charge or choose a lighter attack.";
  return null;
}

export function damageFor(
  state: MatchState,
  side: Side,
  action: Action,
): number {
  if (action.type === "charge") return 0;
  const fighter = state[side].fighters.find(
    (entry) => entry.id === action.fighter,
  )!;
  const support = state[side].fighters.find(
    (entry) => entry.id === (action.type === "attack" ? action.support : null),
  );
  const opponent = state[side === "player" ? "bot" : "player"];
  const raw = Math.max(
    1,
    baseDamage(fighter) + (support?.comboPower ? support.comboPower / 1000 : 0),
  );
  return Math.max(1, Math.floor(raw * (opponent.guarded ? 0.75 : 1)));
}

export function applyAction(
  state: MatchState,
  side: Side,
  input: ActionInput,
): MatchState {
  const error = actionError(state, side, input);
  if (error) throw new Error(error);
  if (!isAction(input)) throw new Error("Unknown action.");
  const action = input;
  const next = structuredClone(state);
  const own = next[side];
  const enemySide: Side = side === "player" ? "bot" : "player";
  const enemy = next[enemySide];
  let text: string;
  if (action.type === "charge") {
    const gained = Math.min(3, RULES.maxEnergy - own.energy);
    own.energy += gained;
    own.guarded = true;
    text = `${side === "player" ? "You" : "The bot"} charged +${gained} energy and guarded the next hit.`;
  } else {
    const fighter = own.fighters.find((entry) => entry.id === action.fighter)!;
    const target = enemy.fighters.find((entry) => entry.id === action.target)!;
    const support = own.fighters.find((entry) => entry.id === action.support);
    const damage = damageFor(next, side, action);
    const guarded = enemy.guarded;
    target.hp = Math.max(0, target.hp - damage);
    own.energy -= attackCost(fighter) + (support ? 1 : 0);
    fighter.rest = 2;
    if (support) support.rest = 2;
    enemy.guarded = false;
    text = `${fighter.name}${support ? ` + ${support.name}` : ""} hit ${target.name} for ${damage}${guarded ? " through guard" : ""}.${target.hp === 0 ? " Knockout!" : ""}`;
  }
  next.log.push({ move: state.move, side, text });
  if (enemy.fighters.every((fighter) => fighter.hp === 0)) next.winner = side;
  else if (next.move >= RULES.turnLimit) {
    const hp = (team: Side) =>
      next[team].fighters.reduce((sum, fighter) => sum + fighter.hp, 0);
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
    const lastStanding =
      enemy.fighters.filter((fighter) => fighter.hp > 0).length === 1;
    enemy.fighters.forEach((fighter) => {
      fighter.rest = lastStanding ? 0 : Math.max(0, fighter.rest - 1);
    });
  }
  return next;
}

export function chooseBotAction(state: MatchState, side: Side = "bot"): Action {
  const own = state[side];
  const enemy = state[side === "bot" ? "player" : "bot"];
  const choices: { action: Action; score: number }[] = [];
  for (const fighter of own.fighters)
    for (const target of enemy.fighters)
      for (const support of [
        null,
        ...own.fighters.filter(
          (entry) => entry.comboPower !== null && entry.comboPower > 0,
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
        const score =
          Math.min(target.hp, damage) +
          (damage >= target.hp ? 60 : 0) +
          (100 - target.hp) * 0.15 -
          (support ? 2 : 0) -
          attackCost(fighter) * 0.2;
        choices.push({ action, score });
      }
  choices.sort((left, right) => right.score - left.score);
  return choices[0]?.action ?? { type: "charge" };
}

export function restoreMatch(saved: ReplayInput, catalog: Card[]): MatchState {
  if (
    !saved ||
    saved.version !== RULES.version ||
    !Array.isArray(saved.actions) ||
    saved.actions.length > RULES.turnLimit
  )
    throw new Error("Incompatible practice save.");
  let state = createMatch(saved.playerIds, saved.botIds, catalog);
  for (const action of saved.actions)
    state = applyAction(state, state.turn, action);
  return state;
}
