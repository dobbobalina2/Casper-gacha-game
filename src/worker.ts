import { readCatalog } from "./db/catalog.ts";
import { createInventoryLoader, inventoryRequest } from "./inventory.ts";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
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
  },
} satisfies ExportedHandler<Env>;
