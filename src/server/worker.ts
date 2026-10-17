import { readCatalog } from "./db/catalog.ts";
import { createInventoryLoader, inventoryRequest } from "./inventory.ts";
import { authConfigured, createAuth, type AuthEnv } from "./auth.ts";
import { BattleError, getBattle, listBattles, saveBattle } from "./battles.ts";
import { battleIdSchema } from "../shared/contracts/battles.ts";
import { enforceLimit, LimitError, type RateLimitEnv } from "./rate-limits.ts";
import { ZodError } from "zod";

interface Env extends AuthEnv, RateLimitEnv {
  DB: D1Database;
  ASSETS: Fetcher;
}

async function readSaveBody(request: Request) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) {
    throw new BattleError(415, "Use a JSON request.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new BattleError(400, "Missing battle data.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32768) {
      await reader.cancel();
      throw new BattleError(413, "Battle data is too large.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new BattleError(400, "Invalid JSON.");
  }
}

async function accountRoutes(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  if (url.pathname === "/api/auth-status" && request.method === "GET") {
    return json(request, { enabled: authConfigured(env) });
  }
  if (
    !url.pathname.startsWith("/api/auth/") &&
    url.pathname !== "/api/battles" &&
    !url.pathname.startsWith("/api/battles/")
  )
    return null;
  if (!authConfigured(env))
    return json(
      request,
      { error: "Google sign-in is unavailable right now." },
      503,
    );
  try {
    const auth = createAuth(env);
    if (url.pathname.startsWith("/api/auth/")) {
      const response = await auth.handler(request);
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      return new Response(response.body, { status: response.status, headers });
    }
    if (!["GET", "PUT"].includes(request.method))
      return json(request, { error: "Method not allowed." }, 405);
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      return json(request, { error: "Sign in to access your battles." }, 401);
    // Prevent queued work from one account being written after the cookie changes to another.
    if (request.headers.get("X-Casper-User") !== session.user.id) {
      return json(
        request,
        { error: "Your account changed. Refresh before continuing." },
        409,
      );
    }
    if (url.pathname === "/api/battles" && request.method === "GET") {
      return json(request, await listBattles(env.DB, session.user.id));
    }
    const id = battleIdSchema.safeParse(
      url.pathname.slice("/api/battles/".length),
    );
    if (!id.success) return json(request, { error: "Battle not found." }, 404);
    if (request.method === "GET")
      return json(request, await getBattle(env.DB, session.user.id, id.data));
    if (request.headers.get("Origin") !== env.BETTER_AUTH_URL) {
      return json(request, { error: "Invalid request origin." }, 403);
    }
    await enforceLimit(env.BATTLE_WRITE_LIMITER, session.user.id);
    return json(
      request,
      await saveBattle(
        env.DB,
        session.user.id,
        id.data,
        await readSaveBody(request),
        env.NEW_BATTLE_LIMITER,
      ),
    );
  } catch (error) {
    if (error instanceof LimitError) throw error;
    if (error instanceof BattleError)
      return json(request, { error: error.message }, error.status);
    if (error instanceof ZodError)
      return json(request, { error: "Invalid battle data." }, 400);
    // Do not log account data, credentials, cookies or replay bodies.
    console.error("Account request failed");
    return json(
      request,
      {
        error:
          "Account service is temporarily unavailable. Keep this page open and retry saving.",
      },
      503,
    );
  }
}

const inventoryLoaders = new WeakMap<
  D1Database,
  ReturnType<typeof createInventoryLoader>
>();
function json(request: Request, data: unknown, status = 200) {
  return new Response(request.method === "HEAD" ? null : JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) {
        // Cloudflare supplies this header. Never trust client-controlled X-Forwarded-For.
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        await enforceLimit(env.API_LIMITER, ip);
        if (url.pathname === "/api/inventory")
          await enforceLimit(env.INVENTORY_LIMITER, ip);
      }
      const accountResponse = await accountRoutes(request, env, url);
      if (accountResponse) return accountResponse;
      if (!["GET", "HEAD"].includes(request.method)) {
        return new Response(null, {
          status: 405,
          headers: { Allow: "GET, HEAD" },
        });
      }
      if (url.pathname === "/api/catalog") {
        try {
          return json(request, await readCatalog(env.DB));
        } catch (error) {
          console.error("Catalog database read failed", error);
          return json(
            request,
            {
              error:
                "Card catalog is unavailable. Check database migrations and try again.",
            },
            503,
          );
        }
      }
      if (url.pathname === "/api/inventory") {
        try {
          inventoryRequest(url.searchParams);
        } catch {
          return json(request, { error: "Invalid inventory request." }, 400);
        }
        try {
          let load = inventoryLoaders.get(env.DB);
          if (!load) {
            load = createInventoryLoader(fetch, env.DB);
            inventoryLoaders.set(env.DB, load);
          }
          return json(request, await load(url.searchParams));
        } catch (error) {
          console.error("Inventory read failed", error);
          return json(
            request,
            {
              error:
                "Collector Crypt inventory is temporarily unavailable. Try again shortly.",
            },
            502,
          );
        }
      }
      if (url.pathname.startsWith("/api/"))
        return json(request, { error: "Not found." }, 404);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (!(error instanceof LimitError)) throw error;
      const response = json(request, { error: error.message }, error.status);
      response.headers.set("Retry-After", "60");
      return response;
    }
  },
} satisfies ExportedHandler<Env>;
