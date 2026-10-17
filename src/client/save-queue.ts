import type { Replay } from "../shared/contracts/battles.ts";
import type { Card } from "../shared/contracts/catalog.ts";

export type SaveRecord = {
  id: string;
  localId: string;
  revision: number;
  replay: Replay;
  catalog: Card[];
  updatedAt: number;
  dirty: boolean;
  blocked?: boolean;
};
export type QueueError = Error & { status?: number; retryAfterMs?: number };

// One writer per tab. Each local copy has its own key so a conflicting tab cannot
// erase an offline branch. The server revision decides which history is current.
export function createSaveQueue({
  send,
  persist,
  onStatus = () => {},
}: {
  send(record: SaveRecord): Promise<{ revision: number }>;
  persist(record: SaveRecord): void;
  onStatus?(message: string, localId: string): void;
}) {
  const records = new Map<string, SaveRecord>();
  const fullStorage = new Set<string>();
  const quotaMessage =
    "Cloud storage is full. This new battle stays on this browser; existing cloud battles can still be resumed.";
  let running: Promise<void> | null = null;
  let stopped = false;
  let retryAt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  function store(record: SaveRecord): boolean {
    try {
      persist(record);
      return true;
    } catch {
      onStatus(
        "Browser backup unavailable. Keep this page open until saved online.",
        record.localId,
      );
      return false;
    }
  }
  async function drain(): Promise<void> {
    for (const record of records.values()) {
      if (stopped) break;
      if (!record.dirty || record.blocked || fullStorage.has(record.localId))
        continue;
      onStatus("Saving battle…", record.localId);
      const sent = structuredClone(record);
      try {
        const saved = await send(sent);
        record.revision = saved.revision;
        record.dirty =
          JSON.stringify(record.replay) !== JSON.stringify(sent.replay);
        store(record);
        if (!stopped)
          onStatus(
            record.dirty ? "Saving latest moves…" : "Battle saved online",
            record.localId,
          );
        if (record.dirty && !stopped) return drain();
      } catch (caught: unknown) {
        const error = caught as QueueError;
        if (!stopped && error.status === 429) {
          retryAt = Date.now() + (error.retryAfterMs || 60000);
          if (retryTimer !== null) clearTimeout(retryTimer);
          retryTimer = setTimeout(
            () => {
              retryTimer = null;
              void flush();
            },
            Math.max(0, retryAt - Date.now()),
          );
        }
        record.blocked = [400, 409].includes(error.status ?? 0);
        const backedUp = store(record);
        if (!stopped && backedUp)
          onStatus(
            error.status
              ? error.message
              : "Battle could not sync. Keep this page open and use ↻ Save to retry.",
            record.localId,
          );
        if (error.status === 507) {
          fullStorage.add(record.localId);
          continue;
        }
        return;
      }
    }
  }
  function flush(): Promise<void> {
    if (stopped || Date.now() < retryAt) return Promise.resolve();
    if (
      !running &&
      ![...records.values()].some(
        (record) =>
          record.dirty && !record.blocked && !fullStorage.has(record.localId),
      )
    )
      return Promise.resolve();
    if (!running)
      running = drain().finally(() => {
        running = null;
      });
    return running;
  }
  return {
    enqueue(input: SaveRecord): void {
      if (stopped) return;
      const previous = records.get(input.localId);
      const record: SaveRecord = {
        ...structuredClone(input),
        revision: previous?.revision ?? input.revision,
        blocked: previous?.blocked ?? input.blocked ?? false,
        dirty: true,
      };
      if (previous) Object.assign(previous, record);
      else records.set(input.localId, record);
      onStatus(
        "Waiting to save — use ↻ Save to retry if needed",
        record.localId,
      );
      const backedUp = store(previous || record);
      if (backedUp && fullStorage.has(record.localId))
        onStatus(quotaMessage, record.localId);
      if (backedUp && record.blocked)
        onStatus(
          "Cloud save conflict — local copy retained. Open My battles to resume the cloud save.",
          record.localId,
        );
      void flush();
    },
    flush,
    retry(): Promise<void> {
      fullStorage.clear();
      for (const record of records.values()) {
        if (record.blocked) {
          record.blocked = false;
          store(record);
        }
      }
      return flush();
    },
    stop(): void {
      stopped = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
    },
  };
}
