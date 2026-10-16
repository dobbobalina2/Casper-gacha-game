import { seedCards } from "./lib/seed-catalog.ts";
import * as engine from "../src/shared/engine.ts";
import type { Side } from "../src/shared/engine.ts";
import { pathToFileURL } from "node:url";
const cards = seedCards;
export function evaluate(e: typeof engine = engine) {
  const teams = [];
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      for (let k = j + 1; k < cards.length; k++) {
        const ids = [cards[i].id, cards[j].id, cards[k].id];
        if (!e.validateTeam(ids, cards)) teams.push(ids);
      }
  const matches: {
    player: string[];
    bot: string[];
    turns: number;
    winner: Side | "draw" | null;
    limit: boolean;
  }[] = [];
  for (const player of teams)
    for (const bot of teams) {
      let state = e.createMatch(player, bot, cards);
      while (!state.winner)
        state = e.applyAction(
          state,
          state.turn,
          e.chooseBotAction(state, state.turn),
        );
      matches.push({
        player,
        bot,
        turns: state.move,
        winner: state.winner,
        limit: state.move === e.RULES.turnLimit,
      });
    }
  const turns = matches.map((m) => m.turns).sort((a, b) => a - b);
  return {
    version: e.RULES.version,
    matches: matches.length,
    min: turns[0],
    median: turns[Math.floor(turns.length / 2)],
    max: turns.at(-1),
    limitFinishes: matches.filter((m) => m.limit).length,
    firstSeatWins: matches.filter((m) => m.winner === "player").length,
    teamResults: teams.map((ids) => ({
      ids,
      wins: matches.filter(
        (m) =>
          (m.player === ids && m.winner === "player") ||
          (m.bot === ids && m.winner === "bot"),
      ).length,
      games: teams.length * 2,
    })),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const selected = process.argv[2]
    ? ((await import(
        pathToFileURL(process.argv[2]).href
      )) as unknown as typeof engine)
    : engine;
  console.log(JSON.stringify(evaluate(selected), null, 2));
}
