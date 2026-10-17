import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { enforceLimit, LimitError } from "../src/server/rate-limits.ts";

test("missing and failed limiters fail closed", async () => {
  for (const binding of [
    undefined,
    {
      limit: async () => {
        throw new Error("service failure");
      },
    },
  ])
    await assert.rejects(
      enforceLimit(binding as RateLimit, "test"),
      (error: unknown) => error instanceof LimitError && error.status === 503,
    );
});

test("edge API limits are per IP; inventory has a stricter independent limit", async () => {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: "dist/worker.js",
      compatibilityDate: "2026-10-01",
      compatibilityFlags: ["nodejs_compat"],
      ratelimits: {
        API_LIMITER: { namespace_id: "8001", simple: { limit: 3, period: 60 } },
        INVENTORY_LIMITER: {
          namespace_id: "8002",
          simple: { limit: 1, period: 60 },
        },
      },
    }),
  );
  try {
    const call = (path: string, ip: string) =>
      runtime.dispatchFetch("http://casper.test" + path, {
        headers: {
          "CF-Connecting-IP": ip,
          "X-Forwarded-For": crypto.randomUUID(),
        },
      });
    for (let i = 0; i < 3; i++)
      assert.equal((await call("/api/auth-status", "192.0.2.1")).status, 200);
    const blocked = await call("/api/auth-status", "192.0.2.1");
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "60");
    assert.equal(blocked.headers.get("cache-control"), "no-store");
    assert.equal((await call("/api/auth-status", "192.0.2.2")).status, 200);
    // Invalid queries need no DB but still consume inventory allowance.
    assert.equal(
      (await call("/api/inventory?pool=bad", "192.0.2.3")).status,
      400,
    );
    assert.equal(
      (await call("/api/inventory?pool=bad", "192.0.2.3")).status,
      429,
    );
  } finally {
    await runtime.dispose();
  }
});

test("deployment separates staging bindings and copies only browser artifacts", () => {
  const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
  const staging = config.env.staging;
  assert.notEqual(
    staging.d1_databases[0].database_id,
    config.d1_databases[0].database_id,
  );
  const namespaces = [...config.ratelimits, ...staging.ratelimits].map(
    (r) => r.namespace_id,
  );
  assert.equal(new Set(namespaces).size, namespaces.length);
  assert.equal(staging.workers_dev, false);
  assert.match(
    JSON.parse(readFileSync("package.json", "utf8")).scripts.deploy,
    /--env=""/,
  );
  assert.match(
    JSON.parse(readFileSync("package.json", "utf8")).scripts["dev:cloud"],
    /--env staging/,
  );
  assert.deepEqual(readdirSync("dist/client").sort(), [
    "_headers",
    "app.js",
    "assets",
    "index.html",
    "styles.css",
  ]);
  const policy = readFileSync("dist/client/_headers", "utf8");
  assert.match(policy, /script-src 'self';/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /X-Content-Type-Options: nosniff/);
});
