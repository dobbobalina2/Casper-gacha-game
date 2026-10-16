import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import cardsJson from "../../public/cards.json";
import {
  applyAction,
  chooseBotAction,
  createMatch,
  restoreMatch,
  teamCost,
  validateTeam,
  type Action,
  type MatchState,
} from "../shared/engine.ts";
import type { Card, Replay } from "../shared/types.ts";
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
    [resolving, setResolving] = useState(false);
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
    if (!restored) return;
    const validSelection =
      Array.isArray(restored.selected) &&
      restored.selected.length <= 3 &&
      new Set(restored.selected).size === restored.selected.length &&
      restored.selected.every(
        (id) => typeof id === "string" && cards.some((card) => card.id === id),
      ) &&
      teamCost(
        restored.selected.map((id) => cards.find((card) => card.id === id)!),
      ) <= 14;
    setSelected(
      validSelection ? restored.selected : ["FB05-030", "SB02-043", "FB01-140"],
    );
    if (restored.replay) {
      try {
        setReplay(restored.replay);
        setState(restoreMatch(restored.replay, cards));
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
  function savePractice(nextSelected: string[], nextReplay: Replay | null) {
    try {
      localStorage.setItem(
        saveKey,
        JSON.stringify({ selected: nextSelected, replay: nextReplay }),
      );
    } catch {
      setNotice("Browser storage is unavailable.");
    }
  }
  function pick(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= 3
          ? (notify("Choose up to three fighters."), current)
          : (() => {
              const candidate = cards.find((card) => card.id === id);
              const team = current
                .map((item) => cards.find((card) => card.id === item)!)
                .filter(Boolean);
              if (!candidate || teamCost([...team, candidate]) > 14) {
                notify("That lineup exceeds the 14-cost team budget.");
                return current;
              }
              return [...current, id];
            })(),
    );
  }
  function start() {
    const botIds = ["FB01-140", "SB02-043", "FB09-012"],
      save: Replay = {
        version: "arena-v1",
        playerIds: [...selected],
        botIds,
        actions: [],
      };
    const match = createMatch(selected, botIds, cards);
    savePractice(selected, save);
    setReplay(save);
    setState(match);
  }
  async function act(action: Action) {
    if (!state || !replay || resolving) return;
    try {
      const before = state,
        next = applyAction(before, before.turn, action),
        side = before.turn;
      const nextReplay = { ...replay, actions: [...replay.actions, action] };
      savePractice(selected, nextReplay);
      setResolving(true);
      setState(next);
      setReplay(nextReplay);
      setResolving(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Move rejected.");
    } finally {
      setResolving(false);
    }
  }
  useEffect(() => {
    if (!state || state.turn !== "bot" || state.winner || resolving) return;
    const timer = window.setTimeout(
      () => void act(chooseBotAction(state)),
      700,
    );
    return () => window.clearTimeout(timer);
  }, [state, resolving]);
  function leave() {
    savePractice(selected, null);
    setState(null);
    setReplay(null);
    setDialog(null);
  }
  return (
    <>
      <header className="header">
        <a className="brand" href="/">
          CASPER<span className="brand-sub">CARD ARENA</span>
        </a>
        <div className="header-right">
          <span className="practice">PRACTICE MODE</span>
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
        <span>CASPER / ARENA 001</span>
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
                <p className="eyebrow">THE RULES / ARENA V1</p>
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
