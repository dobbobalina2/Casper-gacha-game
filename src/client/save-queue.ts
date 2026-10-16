import type { Replay } from "../contracts/battles.ts";
import type { Card } from "../contracts/catalog.ts";

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
type QueueError = Error & { status?: number };

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
  let running: Promise<void> | null = null;
  let stopped = false;
  function store(record: SaveRecord): boolean {
    try {
      persist(record);
      return true;
    } catch {
      onStatus("Browser backup unavailable. Keep this page open until saved online.", record.localId);
      return false;
    }
  }
  async function drain(): Promise<void> {
    for (const record of records.values()) {
      if (stopped) break;
      if (!record.dirty || record.blocked) continue;
      onStatus("Saving battle…", record.localId);
      const sent = structuredClone(record);
      try {
        const saved = await send(sent);
        record.revision = saved.revision;
        record.dirty = JSON.stringify(record.replay) !== JSON.stringify(sent.replay);
        store(record);
        if (!stopped) onStatus(record.dirty ? "Saving latest moves…" : "Battle saved online", record.localId);
        if (record.dirty && !stopped) return drain();
      } catch (caught: unknown) {
        const error = caught as QueueError;
        record.blocked = [400, 409].includes(error.status ?? 0);
        store(record);
        if (!stopped) onStatus(error.message || "Offline — retry saving when connected.", record.localId);
        return;
      }
    }
  }
  function flush(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (!running) running = drain().finally(() => { running = null; });
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
      onStatus("Waiting to save — use ↻ Save to retry if needed", record.localId);
      store(previous || record);
      if (record.blocked) onStatus("Cloud save conflict — local copy retained. Open My battles to resume the cloud save.", record.localId);
      void flush();
    },
    flush,
    stop(): void { stopped = true; },
  };
}
