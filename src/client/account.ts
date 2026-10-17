import { z } from "zod";
import {
  battleSchema,
  battleListSchema,
  battleSummarySchema,
  replaySchema,
  type Replay,
} from "../shared/contracts/battles.ts";
import { catalogSchema, type Card } from "../shared/contracts/catalog.ts";
import { createSaveQueue } from "./save-queue.ts";
import { saveWithRecovery } from "./battle-sync.ts";

const localSaveSchema = z.object({
  id: z.uuid(),
  localId: z.uuid(),
  revision: z.number().int().nonnegative(),
  replay: replaySchema,
  catalog: catalogSchema,
  updatedAt: z.number(),
  dirty: z.boolean(),
  blocked: z.boolean().optional(),
});
export type LocalSave = z.infer<typeof localSaveSchema>;
export type AccountUser = { id: string; name: string };
export type AccountAction = "battles" | "retry" | "import" | "login" | "logout";
export type BattleSummary = z.infer<typeof battleSummarySchema>;
export type AccountHistory = {
  open: true;
  cloud: BattleSummary[];
  local: LocalSave[];
  message: string;
  canImportGuest: boolean;
};
export type AccountSnapshot = {
  user: AccountUser | null;
  enabled: boolean;
  status: string;
  history: AccountHistory | null;
};

type AccountOptions = {
  notify(message: string): void;
  resume(record: LocalSave): void;
  clear(): void;
  onChange(snapshot: AccountSnapshot): void;
};
type JsonObject = Record<string, unknown>;
type CurrentSave = Omit<LocalSave, "replay" | "catalog"> &
  Partial<Pick<LocalSave, "replay" | "catalog">>;

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Account request failed. Try again.";
}
function readObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null) return {};
  return value as JsonObject;
}

export function createAccount({
  notify,
  resume,
  clear,
  onChange,
}: AccountOptions) {
  let user: AccountUser | null = null;
  let enabled = false;
  let queue: ReturnType<typeof createSaveQueue> | null = null;
  let current: CurrentSave | null = null;
  let busy = false;
  let status = "";
  let battleHistory: AccountHistory | null = null;
  let disposed = false;
  let historyRequestId = 0;
  const owner = () => user?.id ?? "guest";
  const prefix = () => `casper:save:${owner()}:`;
  const activeKey = () => `casper:active:${owner()}`;
  const snapshot = (): AccountSnapshot => ({
    user,
    enabled,
    status,
    history: battleHistory,
  });
  const publish = () => {
    if (!disposed) onChange(snapshot());
  };
  const setStatus = (message: string) => {
    status = message;
    publish();
  };

  async function request(
    path: string,
    options: RequestInit = {},
  ): Promise<unknown> {
    const headers = new Headers({
      "Content-Type": "application/json",
      ...(user ? { "X-Casper-User": user.id } : {}),
    });
    new Headers(options.headers).forEach((value, name) =>
      headers.set(name, value),
    );
    const response = await fetch(path, {
      credentials: "same-origin",
      signal: AbortSignal.timeout(15000),
      ...options,
      headers,
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const body = readObject(data);
      const error = readObject(body.error);
      const retryAfter = Number(response.headers.get("Retry-After"));
      const failure = new Error(
        String(
          error.message ??
            body.error ??
            body.message ??
            "Account request failed. Try again.",
        ),
      ) as Error & { status: number; retryAfterMs: number };
      failure.status = response.status;
      failure.retryAfterMs =
        Math.min(120, Math.max(1, retryAfter || 60)) * 1000;
      throw failure;
    }
    return data;
  }

  function persist(record: LocalSave, keyPrefix = prefix()): void {
    localStorage.setItem(keyPrefix + record.localId, JSON.stringify(record));
    if (current?.localId === record.localId) current.revision = record.revision;
  }
  function records(keyPrefix = prefix()): LocalSave[] {
    const found: LocalSave[] = [];
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(keyPrefix)) continue;
        try {
          const raw = localStorage.getItem(key);
          if (raw !== null) found.push(localSaveSchema.parse(JSON.parse(raw)));
        } catch {
          // Keep unreadable backups untouched.
        }
      }
    } catch {
      setStatus("Browser backups are unavailable.");
    }
    return found.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  function activate(record: LocalSave): boolean {
    const next: LocalSave = {
      ...structuredClone(record),
      localId: crypto.randomUUID(),
    };
    resume(next);
    current = next;
    let backedUp = true;
    try {
      sessionStorage.setItem(activeKey(), next.localId);
      persist(next);
    } catch {
      backedUp = false;
      setStatus("Browser backup unavailable. Keep this page open.");
    }
    if (user && next.dirty) queue?.enqueue(next);
    return backedUp;
  }
  async function showBattles(): Promise<void> {
    if (disposed) return;
    const requestedOwner = owner();
    const requestId = ++historyRequestId;
    const local = records().filter((record) => !user || record.dirty);
    let cloud: BattleSummary[] = [];
    let message = "";
    if (user) {
      try {
        cloud = battleListSchema.parse(await request("/api/battles")).battles;
      } catch (error) {
        message = errorMessage(error);
      }
    }
    if (
      requestedOwner !== owner() ||
      disposed ||
      requestId !== historyRequestId
    )
      return;
    battleHistory = {
      open: true,
      cloud,
      local,
      message,
      canImportGuest: Boolean(user && records("casper:save:guest:").length),
    };
    publish();
  }
  async function openSavedBattle(
    id: string,
    source: "cloud" | "local",
  ): Promise<void> {
    if (disposed) return;
    const requestedOwner = owner();
    let record: LocalSave | undefined;
    try {
      if (source === "cloud") {
        if (!user) throw new Error("Sign in to open cloud battles.");
        const battle = battleSchema.parse(
          await request(`/api/battles/${encodeURIComponent(id)}`, {
            headers: { "X-Casper-User": user.id },
          }),
        );
        record = { ...battle, localId: crypto.randomUUID(), dirty: false };
      } else {
        record = records().find((item) => item.localId === id);
      }
      if (requestedOwner !== owner() || disposed) return;
      if (!record)
        throw new Error("This save is unavailable. Reopen My battles.");
      const wasBlocked = record.blocked;
      const wasDirty = record.dirty;
      activate(record);
      historyRequestId += 1;
      battleHistory = null;
      setStatus(
        wasBlocked
          ? "Cloud save conflict — this local branch stays on this device. Open the cloud save to continue syncing."
          : wasDirty
            ? "Local backup opened. Saving if connected…"
            : "Cloud battle opened",
      );
    } catch (error) {
      if (disposed || requestedOwner !== owner()) return;
      const message = errorMessage(error);
      notify(message);
      setStatus(message);
    }
  }

  const onlineHandler = () => {
    void queue?.flush();
  };
  return {
    getSnapshot: snapshot,
    async init(): Promise<void> {
      if (disposed) return;
      try {
        const authStatus = readObject(await request("/api/auth-status"));
        if (disposed) return;
        enabled = authStatus.enabled === true;
        if (enabled) {
          const session = readObject(await request("/api/auth/get-session"));
          if (disposed) return;
          const candidate = readObject(session.user);
          user =
            typeof candidate.id === "string" &&
            typeof candidate.name === "string"
              ? { id: candidate.id, name: candidate.name }
              : null;
        }
      } catch {
        setStatus("Account service unavailable. Guest play is available.");
      }
      if (disposed) return;
      current = null;
      if (user) {
        const userId = user.id;
        const keyPrefix = prefix();
        queue = createSaveQueue({
          persist: (record) => persist(record, keyPrefix),
          onStatus: (message, localId) => {
            if (
              user?.id === userId &&
              (!current || current.localId === localId)
            )
              setStatus(message);
          },
          send: (record) =>
            saveWithRecovery(record, {
              get: async () =>
                battleSchema.parse(
                  await request(
                    `/api/battles/${encodeURIComponent(record.id)}`,
                    {
                      headers: { "X-Casper-User": userId },
                    },
                  ),
                ),
              put: async (revision) =>
                battleSummarySchema.parse(
                  await request(
                    `/api/battles/${encodeURIComponent(record.id)}`,
                    {
                      method: "PUT",
                      headers: { "X-Casper-User": userId },
                      body: JSON.stringify({ revision, replay: record.replay }),
                    },
                  ),
                ),
            }),
        });
      }
      setStatus(
        user
          ? "Signed in — battles autosave to your account"
          : enabled
            ? "Guest mode — sign in to save battles across devices"
            : "Google sign-in is not configured. Guest play is available.",
      );
      try {
        const activeId = sessionStorage.getItem(activeKey());
        const all = records();
        const active = all.find((record) => record.localId === activeId);
        if (active && activate(active)) persist({ ...active, dirty: false });
        if (queue) {
          for (const record of all) {
            if (record.dirty && !record.blocked && record.localId !== activeId)
              queue.enqueue(record);
          }
        }
      } catch {
        setStatus(
          "Browser backups are unavailable. Cloud saves still work when signed in.",
        );
      }
      if (new URLSearchParams(location.search).has("login")) {
        if (disposed) return;
        notify("Google sign-in did not finish. Try signing in again.");
        history.replaceState(null, "", location.pathname);
      }
      window.addEventListener("online", onlineHandler);
      publish();
    },
    async action(name: AccountAction): Promise<void> {
      if (disposed) return;
      if (name === "battles") return showBattles();
      if (name === "retry") {
        if (queue) await queue.retry();
        else
          setStatus(
            "Guest battles are saved on this browser. Sign in for cloud saves.",
          );
        return;
      }
      if (name === "import" && user) {
        const record = records("casper:save:guest:")[0];
        if (record)
          activate({
            ...record,
            id: crypto.randomUUID(),
            revision: 0,
            dirty: true,
          });
        historyRequestId += 1;
        battleHistory = null;
        publish();
        return;
      }
      if (busy || (name !== "login" && name !== "logout")) return;
      busy = true;
      try {
        if (name === "login") {
          setStatus("Opening Google sign-in…");
          const body = readObject(
            await request("/api/auth/sign-in/social", {
              method: "POST",
              body: JSON.stringify({
                provider: "google",
                callbackURL: location.origin + "/",
                errorCallbackURL: location.origin + "/?login=failed",
              }),
            }),
          );
          if (disposed) return;
          const url = new URL(String(body.url));
          if (url.origin !== "https://accounts.google.com")
            throw new Error("Invalid sign-in destination.");
          location.assign(url.href);
        } else {
          await request("/api/auth/sign-out", { method: "POST", body: "{}" });
          if (disposed) return;
          queue?.stop();
          queue = null;
          current = null;
          user = null;
          historyRequestId += 1;
          battleHistory = null;
          clear();
          publish();
          setStatus("Signed out. Your account backups remain on this device.");
        }
      } catch (error) {
        if (!disposed) throw error;
      } finally {
        busy = false;
      }
    },
    openSavedBattle,
    closeHistory(): void {
      historyRequestId += 1;
      battleHistory = null;
      publish();
    },
    newBattle(): void {
      current = {
        id: crypto.randomUUID(),
        localId: crypto.randomUUID(),
        revision: 0,
        updatedAt: Date.now(),
        dirty: true,
      };
    },
    save(replay: Replay | null, catalog: Card[]): void {
      if (!replay) return;
      if (!current) this.newBattle();
      const active = current;
      if (!active) return;
      const saved: LocalSave = {
        id: active.id,
        localId: active.localId,
        revision: active.revision,
        replay: structuredClone(replay),
        catalog: structuredClone(catalog),
        updatedAt: Date.now(),
        dirty: true,
        ...(active.blocked === undefined ? {} : { blocked: active.blocked }),
      };
      current = saved;
      let backedUp = true;
      try {
        sessionStorage.setItem(activeKey(), saved.localId);
        persist(saved);
      } catch {
        backedUp = false;
        setStatus(
          "Browser backup unavailable. Keep this page open until saved online.",
        );
      }
      if (queue) queue.enqueue(saved);
      else if (backedUp) setStatus("Battle saved on this browser");
    },
    leave(): void {
      current = null;
      try {
        sessionStorage.removeItem(activeKey());
      } catch {
        /* Storage may be disabled. */
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("online", onlineHandler);
      queue?.stop();
    },
  };
}
