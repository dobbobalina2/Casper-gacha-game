import type { Replay } from "../contracts/battles.ts";
import type { SaveRecord } from "./save-queue.ts";

export type SyncedBattle = { revision: number; replay: Replay };
export type SyncConflict = Error & { status?: number };

// A timed-out write can still reach D1. Recover its revision only when the
// server's entire history is already present in this local replay.
export async function saveWithRecovery<T extends { revision: number }>(
  record: Pick<SaveRecord, "revision" | "replay">,
  { put, get }: {
    put(revision: number): Promise<T>;
    get(): Promise<SyncedBattle>;
  },
): Promise<T> {
  try {
    return await put(record.revision);
  } catch (caught: unknown) {
    const error = caught as SyncConflict;
    if (error.status !== 409) throw caught;
    const saved = await get();
    const remote = saved.replay;
    const local = record.replay;
    const sameHistory = remote.version === local.version &&
      remote.catalogRevision === local.catalogRevision &&
      JSON.stringify(remote.playerIds) === JSON.stringify(local.playerIds) &&
      JSON.stringify(remote.botIds) === JSON.stringify(local.botIds) &&
      JSON.stringify(remote.actions) === JSON.stringify(local.actions.slice(0, remote.actions.length));
    if (saved.revision <= record.revision || !sameHistory) throw caught;
    return put(saved.revision);
  }
}
