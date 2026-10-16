import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import cardsJson from "../../public/cards.json";
import {
  chooseBotAction,
  createMatch,
  restoreMatch,
  teamCost,
  validateTeam,
  type Action,
  type MatchState,
} from "../shared/engine.ts";
import type { Card, Replay } from "../shared/types.ts";
import { createEffects, type CombatEvent } from "./effects.ts";
import { commitMove, presentMove, type BattleSession } from "./battleFlow.ts";
import { Lobby } from "./components/Lobby.tsx";
import { BattleArena } from "./components/BattleArena.tsx";
const cards = cardsJson as Card[];
const saveKey = "casper-arena-v1";
function App() {
  const [selected, setSelected] = useState([
      "FB05-030",
      "SB02-043",
      "FB01-140",
    ]),
    [state, setState] = useState<MatchState | null>(null),
    [replay, setReplay] = useState<Replay | null>(null),
    [dialog, setDialog] = useState<Card | "rules" | "leave" | null>(null),
    [notice, setNotice] = useState(""),
    [presentation, setPresentation] = useState<{
      event: CombatEvent;
      epoch: number;
    } | null>(null);
  const resolving = presentation !== null;
  const effects = useRef<ReturnType<typeof createEffects> | null>(null);
  const session = useRef<BattleSession | null>(null);
  const epoch = useRef(0);
  const locked = useRef(false);
  const restored = useMemo(() => {
    try {
      const value = localStorage.getItem(saveKey);
      return value
        ? (JSON.parse(value) as { selected: string[]; replay: Replay | null })
        : null;
    } catch {
      return null;
    }
  }, []);
  useEffect(() => {
    const root = document.getElementById("root"),
      sound = document.getElementById("sound-button"),
      volume = document.getElementById("sound-volume");
    if (
      root instanceof HTMLElement &&
      sound instanceof HTMLButtonElement &&
      volume instanceof HTMLInputElement
    )
      effects.current = createEffects({
        root,
        soundButton: sound,
        volumeInput: volume,
      });
    return () => {
      epoch.current++;
      effects.current?.cancel();
      effects.current?.dispose();
    };
  }, []);
  useEffect(() => {
    session.current = null;
    if (!restored) return;
    const savedSelection = restored.selected;
    const validSelection =
      Array.isArray(savedSelection) &&
      savedSelection.length <= 3 &&
      new Set(savedSelection).size === savedSelection.length &&
      savedSelection.every(
        (id) => typeof id === "string" && cards.some((card) => card.id === id),
      ) &&
      teamCost(
        savedSelection.map((id) => cards.find((card) => card.id === id)!),
      ) <= 14;
    setSelected(
      validSelection ? savedSelection : ["FB05-030", "SB02-043", "FB01-140"],
    );
    if (restored.replay) {
      try {
        const match = restoreMatch(restored.replay, cards);
        session.current = { match, replay: restored.replay };
        setReplay(restored.replay);
        setState(match);
      } catch {
        localStorage.removeItem(saveKey);
      }
    }
  }, [restored]);
  useEffect(() => {
    try {
      localStorage.setItem(saveKey, JSON.stringify({ selected, replay }));
    } catch {
      setNotice("Browser storage is unavailable.");
    }
  }, [selected, replay]);
  function notify(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 3000);
  }
  function pick(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) {
        notify("Choose up to three fighters.");
        return current;
      }
      const candidate = cards.find((card) => card.id === id);
      const chosen = current
        .map((entry) => cards.find((card) => card.id === entry)!)
        .filter(Boolean);
      if (!candidate || teamCost([...chosen, candidate]) > 14) {
        notify("That lineup exceeds the 14-cost team budget.");
        return current;
      }
      return [...current, id];
    });
  }
  function resetPresentation() {
    epoch.current++;
    locked.current = false;
    effects.current?.cancel();
    setPresentation(null);
  }
  function savePractice(nextSelected: string[], nextReplay: Replay | null) {
    try {
      localStorage.setItem(
        saveKey,
        JSON.stringify({ selected: nextSelected, replay: nextReplay }),
      );
    } catch {
      notify("Browser storage is unavailable.");
    }
  }
  function start() {
    const error = validateTeam(selected, cards);
    if (error) {
      notify(error);
      return;
    }
    resetPresentation();
    const botIds = ["FB05-119", "SB02-043", "FB05-030"],
      save: Replay = {
        version: "arena-v2",
        playerIds: [...selected],
        botIds,
        actions: [],
      };
    const match = createMatch(selected, botIds, cards);
    const next = { match, replay: save };
    session.current = next;
    savePractice(selected, save);
    setReplay(save);
    setState(match);
  }
  function act(action: Action) {
    const current = session.current;
    if (!current || locked.current || current.match.winner) return;
    const actionEpoch = epoch.current;
    try {
      locked.current = true;
      commitMove(
        current,
        action,
        (next) => {
          session.current = next;
          savePractice(selected, next.replay);
        },
        ({ session: next, event }) => {
          setState(next.match);
          setReplay(next.replay);
          setPresentation({ event, epoch: actionEpoch });
        },
      );
    } catch (error) {
      locked.current = false;
      notify(error instanceof Error ? error.message : "Move rejected.");
    }
  }
  useLayoutEffect(() => {
    if (!presentation) return;
    let active = true;
    const presenter = effects.current;
    if (!presenter) {
      locked.current = false;
      setPresentation(null);
      return;
    }
    void presentMove(
      presenter,
      presentation.event,
      presentation.epoch,
      () => epoch.current,
      () => {
        if (active) {
          locked.current = false;
          setPresentation(null);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [presentation]);
  useEffect(() => {
    if (!state || state.turn !== "bot" || state.winner || presentation) return;
    const moveEpoch = epoch.current;
    const timer = window.setTimeout(() => {
      const current = session.current;
      if (
        moveEpoch === epoch.current &&
        current &&
        current.match.turn === "bot" &&
        !current.match.winner &&
        !locked.current
      )
        act(chooseBotAction(current.match));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [state, presentation]);
  function leave() {
    resetPresentation();
    session.current = null;
    setState(null);
    setReplay(null);
    setDialog(null);
    savePractice(selected, null);
  }
  return (
    <>
      <header className="header">
        <a className="brand" href="/">
          CASPER<span className="brand-sub">CARD ARENA</span>
        </a>
        <div className="header-right">
          <span className="practice">PRACTICE MODE</span>
          <div className="sound-controls">
            <button id="sound-button" className="text-button">
              Sound on
            </button>
            <input
              id="sound-volume"
              type="range"
              min="0"
              max="100"
              defaultValue="35"
              aria-label="Sound volume"
            />
          </div>
          <button className="text-button" onClick={() => setDialog("rules")}>
            How to play ↗
          </button>
        </div>
      </header>
      <main id="app">
        {state ? (
          <BattleArena
            state={state}
            resolving={resolving}
            onAction={(action) => void act(action)}
            onLeave={() => (state.winner ? leave() : setDialog("leave"))}
            onRematch={start}
          />
        ) : (
          <Lobby
            cards={cards}
            selected={selected}
            onPick={pick}
            onDetail={setDialog}
            onStart={start}
            onRecommended={() =>
              setSelected(["FB05-030", "SB02-043", "FB01-140"])
            }
          />
        )}
      </main>
      <footer>
        <span>CASPER / ARENA 002</span>
        <p>
          Practice with real collectible references. No ownership, purchases, or
          prizes.
        </p>
        <span>FUSION WORLD</span>
      </footer>
      <div
        id="notice"
        role="status"
        aria-live="polite"
        className={notice ? "visible" : ""}
      >
        {notice}
      </div>
      {dialog && (
        <div className="modal-backdrop" onClick={() => setDialog(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="text-button" onClick={() => setDialog(null)}>
              Close ×
            </button>
            {dialog === "rules" ? (
              <>
                <p className="eyebrow">THE RULES / ARENA V2</p>
                <h2>Three fighters. Every move matters.</h2>
                <p>
                  Build a team within 14 cost. Attack, add combo support, or
                  charge and guard. Knock out the other team before turn 60.
                </p>
              </>
            ) : dialog === "leave" ? (
              <>
                <p className="eyebrow">LEAVE PRACTICE MATCH</p>
                <h2>Back to the lineup?</h2>
                <p>
                  Your current match will end. You can start another any time.
                </p>
                <button className="button primary" onClick={leave}>
                  Leave match
                </button>
              </>
            ) : (
              <>
                <p className="eyebrow">CARD DETAILS</p>
                <h2>{dialog.name}</h2>
                <p>
                  {dialog.id} · {dialog.family} · {dialog.color} ·{" "}
                  {dialog.power.toLocaleString()} power
                </p>
                <img className="detail-image" src={dialog.image} alt="" />
                <a
                  href={dialog.statsSource}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Official stats ↗
                </a>
                <p>{dialog.collectible.description}</p>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
