import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { Card } from "../src/shared/types.ts";
import * as engine from "../src/shared/engine.ts";
const cards = JSON.parse(
  readFileSync(new URL("../public/cards.json", import.meta.url), "utf8"),
) as Card[];
export function evaluate(e: typeof engine = engine) {
  const teams: string[][] = [];
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      for (let k = j + 1; k < cards.length; k++) {
        const ids = [cards[i]!.id, cards[j]!.id, cards[k]!.id];
        if (!e.validateTeam(ids, cards)) teams.push(ids);
      }
  const matches: {
    player: string[];
    bot: string[];
    turns: number;
    winner: string | null;
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
  const turns = matches.map((match) => match.turns).sort((a, b) => a - b);
  return {
    version: e.RULES.version,
    matches: matches.length,
    min: turns[0],
    median: turns[Math.floor(turns.length / 2)],
    max: turns.at(-1),
    limitFinishes: matches.filter((match) => match.limit).length,
    firstSeatWins: matches.filter((match) => match.winner === "player").length,
    teamResults: teams.map((ids) => ({
      ids,
      wins: matches.filter(
        (match) =>
          (match.player === ids && match.winner === "player") ||
          (match.bot === ids && match.winner === "bot"),
      ).length,
      games: teams.length * 2,
    })),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(evaluate(), null, 2));
