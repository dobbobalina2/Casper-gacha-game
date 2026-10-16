import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
import { specialFor, specialCost } from "../shared/specials.ts";
import {
  collectibleUrl,
  mergeInventory,
  type InventoryItem,
} from "./collection.ts";
import { BattleArena } from "./components/BattleArena.tsx";
import { Lobby } from "./components/Lobby.tsx";
import {
  Collection,
  emptyInventory,
  inventoryApiPath,
  type InventoryCode,
  type InventoryState,
} from "./Collection.tsx";
import { commitMove, presentMove, type BattleSession } from "./battleFlow.ts";
import { createEffects, type CombatEvent } from "./effects.ts";

const KEY = "casper-arena-v1";
const recommended = ["FB05-030", "SB02-043", "FB01-140"];
const botLineup = ["FB05-119", "SB02-043", "FB05-030"];
const cards = (cardsJson as Card[]).map((card) => ({
  ...card,
  special: specialFor(card)!,
}));
type Dialog = Card | "rules" | "leave" | null;
type StoredSelection = {
  selected: string[];
  replay: Replay | null;
  match: MatchState | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function readSavedPractice(): StoredSelection {
  const fallback: StoredSelection = {
    selected: recommended,
    replay: null,
    match: null,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const value: unknown = JSON.parse(raw);
    if (!isObject(value)) return fallback;
    const savedSelection = value.selected;
    const selected =
      Array.isArray(savedSelection) &&
      savedSelection.length <= 3 &&
      savedSelection.every((id): id is string => typeof id === "string") &&
      new Set(savedSelection).size === savedSelection.length &&
      savedSelection.every((id) => cards.some((card) => card.id === id)) &&
      teamCost(
        savedSelection.map((id) => cards.find((card) => card.id === id)!),
      ) <= 14
        ? savedSelection
        : recommended;
    const rawReplay = value.replay;
    if (
      !isObject(rawReplay) ||
      typeof rawReplay.version !== "string" ||
      !Array.isArray(rawReplay.playerIds) ||
      !Array.isArray(rawReplay.botIds) ||
      !Array.isArray(rawReplay.actions)
    )
      return { selected, replay: null, match: null };
    try {
      const replay = rawReplay as unknown as Replay;
      return { selected, replay, match: restoreMatch(replay, cards) };
    } catch {
      return { selected, replay: null, match: null };
    }
  } catch {
    return fallback;
  }
}
function validInventoryPage(value: unknown): value is {
  items: InventoryItem[];
  hasMore: boolean;
  nextCursor: string | null;
  fetchedAt: string;
} {
  if (
    !isObject(value) ||
    !Array.isArray(value.items) ||
    typeof value.hasMore !== "boolean" ||
    !(value.nextCursor === null || typeof value.nextCursor === "string") ||
    typeof value.fetchedAt !== "string"
  )
    return false;
  return value.items.every(
    (item) =>
      isObject(item) &&
      typeof item.mint === "string" &&
      typeof item.name === "string" &&
      typeof item.description === "string" &&
      typeof item.image === "string",
  );
}

function App() {
  const [saved] = useState(readSavedPractice);
  const [selected, setSelected] = useState(saved.selected);
  const [state, setState] = useState<MatchState | null>(saved.match);
  const [replay, setReplay] = useState<Replay | null>(saved.replay);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState("");
  const [presentation, setPresentation] = useState<{
    event: CombatEvent;
    epoch: number;
  } | null>(null);
  const [inventory, setInventory] = useState<InventoryState>(() =>
    emptyInventory(),
  );
  const effects = useRef<ReturnType<typeof createEffects> | null>(null);
  const session = useRef<BattleSession | null>(
    saved.match && saved.replay
      ? { match: saved.match, replay: saved.replay }
      : null,
  );
  const epoch = useRef(0);
  const locked = useRef(false);
  const inventoryRequest = useRef<AbortController | null>(null);
  const storageWarning = useRef(false);
  const resolving = presentation !== null;

  const notify = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }, []);
  const savePractice = useCallback(
    (nextSelected: string[], nextReplay: Replay | null) => {
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({ selected: nextSelected, replay: nextReplay }),
        );
      } catch {
        if (!storageWarning.current) {
          storageWarning.current = true;
          notify(
            "Browser storage is unavailable. This session will not survive a refresh.",
          );
        }
      }
    },
    [notify],
  );
  useEffect(() => {
    const root = document.getElementById("root");
    const soundButton = document.getElementById("sound-button");
    const volumeInput = document.getElementById("sound-volume");
    if (
      root instanceof HTMLElement &&
      soundButton instanceof HTMLButtonElement &&
      volumeInput instanceof HTMLInputElement
    )
      effects.current = createEffects({ root, soundButton, volumeInput });
    return () => {
      effects.current?.dispose();
      effects.current = null;
    };
  }, []);
  useEffect(() => {
    savePractice(selected, replay);
  }, [selected, replay, savePractice]);

  const resetPresentation = useCallback(() => {
    epoch.current++;
    locked.current = false;
    effects.current?.cancel();
    setPresentation(null);
  }, []);
  useLayoutEffect(() => {
    if (!presentation) return;
    const moveEpoch = presentation.epoch;
    let active = true;
    const presenter = effects.current;
    if (!presenter) {
      if (epoch.current === moveEpoch) {
        locked.current = false;
        setPresentation(null);
      }
      return;
    }
    void presentMove(
      presenter,
      presentation.event,
      moveEpoch,
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
  useEffect(
    () => () => {
      epoch.current++;
      effects.current?.cancel();
      inventoryRequest.current?.abort();
    },
    [],
  );
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
        commit(chooseBotAction(current.match));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [state, presentation]);

  function start() {
    const error = validateTeam(selected, cards);
    if (error) {
      notify(error);
      return;
    }
    resetPresentation();
    const nextReplay: Replay = {
      version: "arena-v3",
      playerIds: [...selected],
      botIds: [...botLineup],
      actions: [],
    };
    const next: BattleSession = {
      match: createMatch(selected, botLineup, cards),
      replay: nextReplay,
    };
    session.current = next;
    savePractice(selected, nextReplay);
    setReplay(nextReplay);
    setState(next.match);
    setDialog(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function commit(action: Action) {
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
  function leave() {
    resetPresentation();
    session.current = null;
    setState(null);
    setReplay(null);
    setDialog(null);
    savePractice(selected, null);
  }
  function pick(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((entry) => entry !== id);
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
  function loadRecommended() {
    setSelected([...recommended]);
  }

  async function loadInventory() {
    if (inventory.loading || !inventory.hasMore) return;
    const controller = new AbortController();
    inventoryRequest.current?.abort();
    inventoryRequest.current = controller;
    const request = { code: inventory.code, cursor: inventory.cursor };
    setInventory((current) => ({ ...current, loading: true, error: "" }));
    try {
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(15000),
      ]);
      const response = await fetch(
        inventoryApiPath(request.code, request.cursor),
        { signal },
      );
      if (!response.ok)
        throw new Error(
          "Collector Crypt could not be reached. Your practice roster is still available.",
        );
      const data: unknown = await response.json();
      if (!validInventoryPage(data))
        throw new Error("Unexpected inventory response. Please try again.");
      if (
        data.hasMore &&
        (!data.nextCursor || data.nextCursor === request.cursor)
      )
        throw new Error("Inventory did not advance. Please try again shortly.");
      if (inventoryRequest.current !== controller || controller.signal.aborted)
        return;
      setInventory((current) =>
        current.code !== request.code
          ? current
          : {
              ...current,
              items: mergeInventory(current.items, data.items),
              cursor: data.nextCursor,
              hasMore: data.hasMore,
              fetchedAt: data.fetchedAt,
            },
      );
    } catch (error) {
      if (inventoryRequest.current === controller && !controller.signal.aborted)
        setInventory((current) => ({
          ...current,
          error:
            error instanceof Error ? error.message : "Inventory unavailable.",
        }));
    } finally {
      if (inventoryRequest.current === controller) {
        inventoryRequest.current = null;
        setInventory((current) => ({ ...current, loading: false }));
      }
    }
  }
  function changeInventoryPool(code: InventoryCode) {
    inventoryRequest.current?.abort();
    inventoryRequest.current = null;
    setInventory(emptyInventory(code));
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
            <button
              id="sound-button"
              className="text-button"
              aria-pressed="true"
            >
              Sound on
            </button>
            <input
              id="sound-volume"
              type="range"
              min="0"
              max="100"
              defaultValue="35"
              aria-label="Battle sound volume"
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
            onAction={commit}
            onLeave={() => (state.winner ? leave() : setDialog("leave"))}
            onRematch={start}
          />
        ) : (
          <>
            <Lobby
              cards={cards}
              selected={selected}
              onPick={pick}
              onDetail={setDialog}
              onStart={start}
              onRecommended={loadRecommended}
            />
            <Collection
              inventory={inventory}
              cards={cards}
              onPoolChange={changeInventoryPool}
              onLoad={() => void loadInventory()}
              onDetail={setDialog}
            />
          </>
        )}
      </main>
      <footer>
        <span>CASPER / ARENA 003</span>
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
                <p className="eyebrow">THE RULES / ARENA V3</p>
                <h2>Three fighters. Every move matters.</h2>
                <p>
                  Build a three-card team within 14 cost. Attack, support,
                  charge, or use each fighter&apos;s once-per-match special.
                  Knock out the opposing team before turn 60.
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
                <p className="eyebrow">VERIFIED CARD DEFINITION</p>
                <h2>{dialog.name}</h2>
                <p>
                  {dialog.id} · {dialog.family} · {dialog.color} ·{" "}
                  {dialog.power.toLocaleString()} power
                </p>
                <img
                  className="detail-image"
                  src={dialog.image}
                  alt={dialog.collectible.description}
                />
                <div className="special-detail">
                  <p className="eyebrow">CASPER SPECIAL / ONCE PER MATCH</p>
                  <h3>{dialog.special.name}</h3>
                  <p>{dialog.special.description}</p>
                  <p>Costs {specialCost(dialog)} energy.</p>
                </div>
                <a
                  href={dialog.statsSource}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Official stats ↗
                </a>
                <p>{dialog.collectible.description}</p>
                <a
                  href={collectibleUrl(dialog.collectible.mint)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View / buy on Collector Crypt ↗
                </a>
                <p className="mint">Asset: {dialog.collectible.mint}</p>
                <a
                  href={dialog.collectible.inventorySource}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Collector Crypt source ↗
                </a>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
