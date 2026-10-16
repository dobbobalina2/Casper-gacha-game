import {
  applyAction,
  damageFor,
  type Action,
  type MatchState,
  type Side,
} from "../shared/engine.ts";
import type { Replay } from "../shared/types.ts";
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
  const event: CombatEvent =
    action.type === "charge"
      ? {
          type: "charge",
          side,
          energy: match[side].energy - current.match[side].energy,
        }
      : {
          type: "attack",
          side,
          fighter: action.fighter,
          target: action.target,
          support: action.type === "attack" ? (action.support ?? null) : null,
          combo: action.type === "attack" && !!action.support,
          damage: damageFor(current.match, side, action),
          guarded: current.match[other].guarded,
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
    /* Presentation cannot undo a legal move. */
  }
  if (moveEpoch === currentEpoch()) unlock();
}
