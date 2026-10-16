import {
  applyAction,
  damageFor,
  type Action,
  type MatchState,
  type Side,
} from "../shared/engine.ts";
import type { Replay } from "../shared/types.ts";
import { specialFor } from "../shared/specials.ts";
import type { CombatEvent } from "./effects.ts";

export interface BattleSession {
  match: MatchState;
  replay: Replay;
}
export interface CommittedMove {
  session: BattleSession;
  event: CombatEvent;
}
export interface MovePresenter {
  play(event: CombatEvent): Promise<void>;
}

export function commitMove(
  current: BattleSession,
  action: Action,
  persist: (session: BattleSession) => void,
  publish: (move: CommittedMove) => void,
): CommittedMove {
  const side = current.match.turn;
  const other: Side = side === "player" ? "bot" : "player";
  const match = applyAction(current.match, side, action);
  const beforeTarget =
    action.type === "charge"
      ? undefined
      : current.match[other].fighters.find(
          (fighter) => fighter.id === action.target,
        );
  const afterTarget =
    action.type === "charge"
      ? undefined
      : match[other].fighters.find((fighter) => fighter.id === action.target);
  const fighter =
    action.type === "charge"
      ? undefined
      : current.match[side].fighters.find(
          (entry) => entry.id === action.fighter,
        );
  const special =
    action.type === "special" && fighter ? specialFor(fighter) : null;
  const event: CombatEvent =
    action.type === "charge"
      ? {
          type: "charge",
          side,
          energy: match[side].energy - current.match[side].energy,
        }
      : {
          ...action,
          type: action.type,
          side,
          special: special ?? undefined,
          splashHits: current.match[other].fighters.flatMap((before) => {
            const after = match[other].fighters.find(
              (entry) => entry.id === before.id,
            )!;
            return before.id !== action.target && after.hp < before.hp
              ? [
                  {
                    id: before.id,
                    damage: before.hp - after.hp,
                    ko: after.hp === 0,
                  },
                ]
              : [];
          }),
          combo: action.type === "attack" && !!action.support,
          damage: damageFor(current.match, side, action),
          guarded: current.match[other].guarded && !special?.pierce,
          ko: afterTarget?.hp === 0,
        };
  const next: CommittedMove = {
    session: {
      match,
      replay: {
        ...current.replay,
        actions: [...current.replay.actions, action],
      },
    },
    event,
  };
  persist(next.session);
  publish(next);
  return next;
}

export async function presentMove(
  presenter: MovePresenter,
  event: CombatEvent,
  moveEpoch: number,
  currentEpoch: () => number,
  unlock: () => void,
): Promise<void> {
  try {
    await presenter.play(event);
  } catch {
    // Presentation failures never undo a committed game action.
  }
  if (moveEpoch === currentEpoch()) unlock();
}
