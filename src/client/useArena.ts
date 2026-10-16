import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Card } from "../contracts/catalog.ts";
import {
  RULES,
  applyAction,
  chooseBotAction,
  createMatch,
  damageFor,
  type Action,
  type MatchState,
  type Replay,
} from "../shared/engine.ts";
import { specialFor } from "../shared/specials.ts";
import { restoreGuestReplay } from "./guestReplay.ts";
import type { CombatEvent, createEffects } from "./effects.ts";

export interface ArenaSession {
  match: MatchState;
  replay: Replay;
  catalog: Card[];
  id: number;
}

export function useArena(
  effects: RefObject<ReturnType<typeof createEffects> | null>,
  notify: (text: string) => void,
  onSave: (replay: Replay | null) => void,
) {
  const [session, setSession] = useState<ArenaSession | null>(null);
  const [presentation, setPresentation] = useState<{
    event: CombatEvent;
    epoch: number;
  } | null>(null);
  const current = useRef<ArenaSession | null>(null);
  const epoch = useRef(0);
  const locked = useRef(false);
  const reset = useCallback(() => {
    epoch.current++;
    locked.current = false;
    effects.current?.cancel();
    setPresentation(null);
  }, [effects]);
  const clear = useCallback(() => {
    reset();
    current.current = null;
    setSession(null);
    onSave(null);
  }, [onSave, reset]);
  const resume = useCallback(
    (record: { replay: Replay; catalog: Card[]; catalogRevision: string }) => {
      const match = restoreGuestReplay(
        record.replay,
        record.catalog,
        record.catalogRevision,
      );
      reset();
      const next = {
        match,
        replay: structuredClone(record.replay),
        catalog: record.catalog,
        id: epoch.current,
      };
      current.current = next;
      setSession(next);
      onSave(next.replay);
    },
    [onSave, reset],
  );
  const start = useCallback(
    (selected: string[], catalog: Card[], catalogRevision: string) => {
      const botIds = ["FB05-119", "SB02-043", "FB05-030"];
      const match = createMatch(selected, botIds, catalog);
      reset();
      const replay: Replay = {
        version: RULES.version,
        catalogRevision,
        playerIds: [...selected],
        botIds,
        actions: [],
      };
      const next = { match, replay, catalog, id: epoch.current };
      current.current = next;
      setSession(next);
      onSave(replay);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [onSave, reset],
  );
  const leave = useCallback(() => clear(), [clear]);
  const commit = useCallback(
    (action: Action) => {
      const beforeSession = current.current;
      if (!beforeSession || locked.current || beforeSession.match.winner)
        return;
      try {
        const before = beforeSession.match;
        const side = before.turn;
        const other = side === "player" ? "bot" : "player";
        const match = applyAction(before, side, action);
        const hit = action.type !== "charge";
        const special =
          action.type === "special"
            ? specialFor(
                before[side].fighters.find((f) => f.id === action.fighter),
              )
            : null;
        const event: CombatEvent = {
          ...action,
          side,
          special: special ?? undefined,
          combo: action.type === "attack" && !!action.support,
          damage: hit ? damageFor(before, side, action) : 0,
          guarded: before[other].guarded && !special?.pierce,
          ko:
            hit &&
            match[other].fighters.some(
              (f) => f.id === action.target && f.hp === 0,
            ),
          energy: hit ? 0 : match[side].energy - before[side].energy,
          splashHits: hit
            ? before[other].fighters.flatMap((fighter) => {
                const next = match[other].fighters.find(
                  (candidate) => candidate.id === fighter.id,
                )!;
                return fighter.id !== action.target && next.hp < fighter.hp
                  ? [
                      {
                        id: fighter.id,
                        damage: fighter.hp - next.hp,
                        ko: next.hp === 0,
                      },
                    ]
                  : [];
              })
            : [],
        };
        const next: ArenaSession = {
          ...beforeSession,
          match,
          replay: {
            ...beforeSession.replay,
            actions: [...beforeSession.replay.actions, action],
          },
        };
        locked.current = true;
        current.current = next;
        onSave(next.replay);
        setSession(next);
        setPresentation({ event, epoch: epoch.current });
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "Move could not be applied.",
        );
      }
    },
    [notify, onSave],
  );
  useLayoutEffect(() => {
    if (!presentation) return;
    let active = true;
    void (async () => {
      try {
        await effects.current?.play(presentation.event);
      } catch {
        // Presentation cannot undo a legal move.
      }
      if (active && epoch.current === presentation.epoch) {
        locked.current = false;
        setPresentation(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [presentation, effects]);
  useEffect(() => {
    if (
      !session ||
      presentation ||
      session.match.winner ||
      session.match.turn !== "bot"
    )
      return;
    const generation = epoch.current;
    const timer = setTimeout(() => {
      const match = current.current?.match;
      if (
        generation === epoch.current &&
        match &&
        match.turn === "bot" &&
        !match.winner
      )
        commit(chooseBotAction(match));
    }, 350);
    return () => clearTimeout(timer);
  }, [session, presentation, commit]);
  useEffect(
    () => () => {
      epoch.current++;
      effects.current?.cancel();
    },
    [effects],
  );
  return {
    session,
    resolving: !!presentation,
    start,
    commit,
    leave,
    resume,
    clear,
  };
}
