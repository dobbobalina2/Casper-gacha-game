import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { catalogResponseSchema, type Card } from "../contracts/catalog.ts";
import { inventoryPageSchema } from "../contracts/inventory.ts";
import { RULES, teamCost, type Replay } from "../shared/engine.ts";
import { createEffects } from "./effects.ts";
import { guestReplaySchema } from "./guestReplay.ts";
import { mergeInventory } from "./collection.ts";
import { useArena } from "./useArena.ts";
import { Lobby } from "./components/Lobby.tsx";
import { BattleArena } from "./components/BattleArena.tsx";
import { CardDetails, Modal, Rules } from "./components/Dialogs.tsx";
import {
  Collection,
  emptyInventory,
  type InventoryState,
} from "./components/Collection.tsx";

const KEY = "casper-arena-v1";
const recommended = ["FB05-030", "SB02-043", "FB01-140"];
const selectionSchema = z.strictObject({
  selected: z.array(z.string()).max(3),
  replay: guestReplaySchema.nullable().optional(),
});
type Dialog =
  { kind: "rules" } | { kind: "card"; card: Card } | { kind: "leave" } | null;
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";

export function App() {
  const [catalog, setCatalog] = useState<z.infer<
    typeof catalogResponseSchema
  > | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<string[]>(recommended);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [inventory, setInventory] = useState<InventoryState>(() =>
    emptyInventory(),
  );
  const inventoryRef = useRef(inventory);
  const inventoryRequest = useRef<AbortController | null>(null);
  const main = useRef<HTMLElement>(null);
  const soundButton = useRef<HTMLButtonElement>(null);
  const volumeInput = useRef<HTMLInputElement>(null);
  const effects = useRef<ReturnType<typeof createEffects> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const storageWarned = useRef(false);
  const replayRef = useRef<Replay | null>(null);
  const notify = useCallback((text: string) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3500);
  }, []);
  const persistReplay = useCallback(
    (replay: Replay | null) => {
      replayRef.current = replay;
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({ selected: selectedRef.current, replay }),
        );
      } catch {
        if (!storageWarned.current) {
          notify(
            "Browser storage is unavailable. This match will not survive a refresh.",
          );
          storageWarned.current = true;
        }
      }
    },
    [notify],
  );
  const arena = useArena(effects, notify, persistReplay);
  const { resume } = arena;
  const persistSelection = useCallback(
    (ids: string[]) => {
      setSelected(ids);
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({ selected: ids, replay: replayRef.current }),
        );
      } catch {
        if (!storageWarned.current) {
          notify(
            "Browser storage is unavailable. This session will not survive a refresh.",
          );
          storageWarned.current = true;
        }
      }
    },
    [notify],
  );
  useEffect(() => {
    if (!main.current || !soundButton.current || !volumeInput.current) return;
    const instance = createEffects({
      root: main.current,
      soundButton: soundButton.current,
      volumeInput: volumeInput.current,
    });
    effects.current = instance;
    return () => {
      instance.dispose();
      effects.current = null;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/catalog", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        if (!response.ok) throw new Error("Roster request failed.");
        const data = catalogResponseSchema.parse(await response.json());
        if (!active) return;
        let ids = [...recommended];
        try {
          const stored = selectionSchema.safeParse(
            JSON.parse(localStorage.getItem(KEY) || "null"),
          );
          if (stored.success) {
            const wanted = stored.data.selected;
            if (
              new Set(wanted).size === wanted.length &&
              wanted.every((id) => data.cards.some((card) => card.id === id))
            ) {
              const team = data.cards.filter((card) =>
                wanted.includes(card.id),
              );
              if (teamCost(team) <= RULES.budget) ids = wanted;
            }
            if (stored.data.replay) {
              try {
                resume({
                  replay: stored.data.replay,
                  catalog: data.cards,
                  catalogRevision: data.revision,
                });
              } catch {
                replayRef.current = null;
                notify(
                  "Card stats changed. Your lineup is saved; start a fresh match.",
                );
              }
            }
          }
        } catch {
          notify("Saved practice data could not be read. Starting fresh.");
        }
        persistSelection(ids);
        setCatalog(data);
      } catch (error) {
        if (active) {
          setLoadError(true);
          console.error(error);
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [notify, persistSelection, resume]);
  useEffect(
    () => () => {
      clearTimeout(noticeTimer.current);
      inventoryRequest.current?.abort();
    },
    [],
  );
  function pick(id: string) {
    if (!catalog) return;
    if (selected.includes(id))
      return persistSelection(selected.filter((value) => value !== id));
    if (selected.length >= 3)
      return notify("Remove a fighter before adding another.");
    const next = [...selected, id];
    if (
      teamCost(catalog.cards.filter((card) => next.includes(card.id))) >
      RULES.budget
    )
      return notify("That lineup exceeds the 14-cost team budget.");
    persistSelection(next);
  }
  function start() {
    if (!catalog) return;
    try {
      arena.start(selected, catalog.cards, catalog.revision);
    } catch (error) {
      notify(message(error));
    }
  }
  function closeDialog() {
    setDialog(null);
  }
  function updateInventory(next: InventoryState) {
    inventoryRef.current = next;
    setInventory(next);
  }
  async function loadInventory(code?: string) {
    if (code) {
      inventoryRequest.current?.abort();
      updateInventory(emptyInventory(code));
    }
    const current = inventoryRef.current;
    if (current.loading || !current.hasMore) return;
    const controller = new AbortController();
    inventoryRequest.current = controller;
    updateInventory({ ...current, loading: true, error: "" });
    try {
      const url = new URL("/api/inventory", location.origin);
      url.searchParams.set("code", current.code);
      if (current.cursor) url.searchParams.set("cursor", current.cursor);
      const response = await fetch(url, {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      if (!response.ok)
        throw new Error(
          "Collector Crypt could not be reached. Your practice roster is still available.",
        );
      const data = inventoryPageSchema.parse(await response.json());
      if (
        data.hasMore &&
        (!data.nextCursor || data.nextCursor === current.cursor)
      )
        throw new Error("Inventory did not advance. Please try again shortly.");
      if (inventoryRequest.current !== controller) return;
      updateInventory({
        ...current,
        items: mergeInventory(current.items, data.items),
        cursor: data.nextCursor,
        hasMore: data.hasMore,
        fetchedAt: data.fetchedAt,
        loading: false,
        error: "",
      });
    } catch (error) {
      if (inventoryRequest.current === controller && !controller.signal.aborted)
        updateInventory({ ...current, loading: false, error: message(error) });
    }
  }
  const openDetail = (card: Card) => setDialog({ kind: "card", card });
  return (
    <>
      <header className="header">
        <a className="brand" href="/" aria-label="Casper home">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path
              d="M6 27V13a10 10 0 0 1 20 0v14l-5-3-5 3-5-3z"
              fill="currentColor"
            />
            <circle cx="12" cy="13" r="2" fill="#101216" />
            <circle cx="20" cy="13" r="2" fill="#101216" />
          </svg>
          CASPER<span className="brand-sub">CARD ARENA</span>
        </a>
        <div className="header-right">
          <span className="practice">
            <i /> PRACTICE MODE
          </span>
          <div className="sound-controls">
            <button
              ref={soundButton}
              className="text-button"
              id="sound-button"
              aria-pressed="true"
            >
              Sound on
            </button>
            <input
              ref={volumeInput}
              id="sound-volume"
              type="range"
              min="0"
              max="100"
              defaultValue="35"
              aria-label="Battle sound volume"
            />
          </div>
          <button
            className="text-button"
            id="rules-button"
            onClick={() => setDialog({ kind: "rules" })}
          >
            How to play <span>↗</span>
          </button>
        </div>
      </header>
      <main id="app" ref={main}>
        {loadError ? (
          <section className="load-error">
            <p className="eyebrow">ARENA UNAVAILABLE</p>
            <h1>Roster couldn’t load.</h1>
            <p>Check the local server and reload the page.</p>
            <a href="/" className="button primary">
              Try again
            </a>
          </section>
        ) : !catalog ? (
          <div className="loading">Preparing the arena…</div>
        ) : arena.session ? (
          <BattleArena
            key={arena.session.id}
            state={arena.session.match}
            resolving={arena.resolving}
            onAction={arena.commit}
            onRematch={start}
            onLeave={() =>
              arena.session?.match.winner
                ? arena.leave()
                : setDialog({ kind: "leave" })
            }
          />
        ) : (
          <>
            <Lobby
              cards={catalog.cards}
              selected={selected}
              onPick={pick}
              onDetail={openDetail}
              onStart={start}
              onRecommended={() => persistSelection([...recommended])}
            />
            <Collection
              cards={catalog.cards}
              inventory={inventory}
              onDetail={openDetail}
              onLoad={() => void loadInventory()}
              onPool={(code) => void loadInventory(code)}
            />
          </>
        )}
      </main>
      <div
        id="notice"
        role="status"
        aria-live="polite"
        className={notice ? "visible" : ""}
      >
        {notice}
      </div>
      <footer>
        <span>CASPER / ARENA 001</span>
        <p>
          Practice with real collectible references. No ownership, purchases, or
          prizes. Custom arena rules; not the official Dragon Ball card game.
        </p>
        <span>FUSION WORLD</span>
      </footer>
      {dialog && (
        <Modal onClose={closeDialog}>
          {dialog.kind === "rules" ? (
            <Rules />
          ) : dialog.kind === "card" ? (
            <CardDetails card={dialog.card} />
          ) : (
            <>
              <p className="eyebrow">LEAVE PRACTICE MATCH</p>
              <h2>Back to the lineup?</h2>
              <p>Your current match is saved on this browser.</p>
              <button
                className="button primary confirm-leave"
                onClick={() => {
                  arena.leave();
                  closeDialog();
                }}
              >
                Leave match
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
