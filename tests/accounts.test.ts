import { testRateLimits } from "./helpers/rate-limits.ts";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import {
  Miniflare,
  convertV4MiniflareOptions,
  Response as RuntimeResponse,
} from "miniflare";
import { catalogResponseSchema } from "../src/shared/contracts/catalog.ts";
import {
  battleSchema,
  battleSummarySchema,
  replaySchema,
  type Replay,
} from "../src/shared/contracts/battles.ts";
import {
  applyAction,
  chooseBotAction,
  restoreMatch,
} from "../src/shared/engine.ts";

const origin = "http://127.0.0.1:4317";
const clientId = "isolated-test.apps.googleusercontent.com";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "test-key",
  alg: "RS256",
  use: "sig",
};
let runtime: Miniflare, db: D1Database;
type Identity = { id: string; cookie: string };
let alice: Identity, bob: Identity, initial: Replay;
const cookie = (response: Response, name: string) =>
  response.headers
    .get("set-cookie")
    ?.match(
      new RegExp(`(?:^|, )(${name.replaceAll(".", "\\.")}=[^;]+)`),
    )?.[1] || "";
function jwt(name: string) {
  const parts = [
    { alg: "RS256", kid: "test-key" },
    {
      iss: "https://accounts.google.com",
      aud: clientId,
      sub: name,
      name,
      email: `${name}@example.test`,
      email_verified: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
  ].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"));
  const data = parts.join(".");
  return `${data}.${sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`;
}
let loginIp = 0;
async function call(
  path: string,
  identity?: Identity,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return runtime.dispatchFetch(origin + path, {
    method,
    redirect: "manual",
    headers: {
      Origin: origin,
      "CF-Connecting-IP": `192.0.2.${loginIp}`,
      "Content-Type": "application/json",
      ...(identity
        ? { Cookie: identity.cookie, "X-Casper-User": identity.id }
        : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function login(name: string) {
  loginIp++;
  const start = await call("/api/auth/sign-in/social", undefined, "POST", {
    provider: "google",
    callbackURL: origin + "/",
  });
  assert.equal(start.status, 200, await start.clone().text());
  const url = new URL(((await start.json()) as { url: string }).url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    origin + "/api/auth/callback/google",
  );
  assert.equal(url.searchParams.get("client_id"), clientId);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.deepEqual(
    new Set(url.searchParams.get("scope")?.split(" ")),
    new Set(["email", "profile", "openid"]),
  );
  const stateCookie = cookie(
    start as unknown as Response,
    "casper.oauth_state",
  );
  // Better Auth may use a signed state cookie or an encrypted state payload.
  const cookies =
    stateCookie || start.headers.get("set-cookie")?.split(";")[0] || "";
  const end = await call(
    `/api/auth/callback/google?code=${name}&state=${encodeURIComponent(url.searchParams.get("state")!)}`,
    undefined,
    "GET",
    undefined,
    { Cookie: cookies },
  );
  assert.equal(end.status, 302, await end.clone().text());
  assert.equal(end.headers.get("location"), origin + "/");
  const sessionCookie = cookie(
    end as unknown as Response,
    "casper.session_token",
  );
  assert.ok(sessionCookie);
  assert.match(end.headers.get("set-cookie")!, /HttpOnly/i);
  assert.match(end.headers.get("set-cookie")!, /SameSite=Lax/i);
  const session = await call(
    "/api/auth/get-session",
    undefined,
    "GET",
    undefined,
    { Cookie: sessionCookie },
  );
  const data = (await session.json()) as { user: { id: string } };
  assert.ok(data.user.id);
  return { id: data.user.id, cookie: sessionCookie };
}
before(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      ratelimits: {
        ...testRateLimits,
        NEW_BATTLE_LIMITER: {
          namespace_id: "7003",
          simple: { limit: 10, period: 60 },
        },
        BATTLE_WRITE_LIMITER: {
          namespace_id: "7002",
          simple: { limit: 90, period: 60 },
        },
      },
      scriptPath: "dist/worker.js",
      compatibilityDate: "2026-10-01",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "auth-tests" },
      bindings: {
        BETTER_AUTH_URL: origin,
        BETTER_AUTH_SECRET:
          "test-only-long-secret-for-isolated-database-123456",
        GOOGLE_CLIENT_ID: clientId,
        GOOGLE_CLIENT_SECRET: "test-only-google-secret",
      },
      outboundService: async (request) => {
        const url = new URL(request.url);
        if (url.href === "https://oauth2.googleapis.com/token") {
          const form = new URLSearchParams(await request.text());
          assert.equal(
            form.get("redirect_uri"),
            origin + "/api/auth/callback/google",
          );
          assert.ok(form.get("code_verifier"));
          return RuntimeResponse.json({
            access_token: "test-access-token",
            token_type: "Bearer",
            expires_in: 3600,
            id_token: jwt(form.get("code")!),
            scope: "email profile openid",
          });
        }
        assert.equal(url.href, "https://www.googleapis.com/oauth2/v3/certs");
        return RuntimeResponse.json({ keys: [jwk] });
      },
    }),
  );
  db = (await runtime.getD1Database("DB")) as unknown as D1Database;
  for (const file of readdirSync("db/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const statements = readFileSync(`db/migrations/${file}`, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    await db.batch(statements.map((sql) => db.prepare(sql)));
  }
  alice = await login("alice");
  bob = await login("bob");
  const catalog = catalogResponseSchema.parse(
    await (await call("/api/catalog")).json(),
  );
  initial = {
    version: "arena-v3",
    catalogRevision: catalog.revision,
    playerIds: ["FB05-030", "SB02-043", "FB01-140"],
    botIds: ["FB05-119", "SB02-043", "FB05-030"],
    actions: [],
  };
});
after(async () => {
  await runtime?.dispose();
});

test("Google callback creates separate accounts and encrypts access tokens", async () => {
  assert.notEqual(alice.id, bob.id);
  const row = await db
    .prepare("SELECT access_token FROM auth_account WHERE user_id = ?")
    .bind(alice.id)
    .first<{ access_token: string }>();
  assert.ok(row?.access_token);
  assert.notEqual(row.access_token, "test-access-token");
  assert.equal(
    (await call("/api/auth/callback/google?code=evil&state=invalid")).status,
    302,
  );
  assert.equal(
    (
      await call(
        "/api/auth/sign-in/social",
        undefined,
        "POST",
        { provider: "google", callbackURL: "https://evil.test/" },
        { Origin: "https://evil.test" },
      )
    ).status,
    403,
  );
});
test("saves require a live session, matching account, origin and valid input", async () => {
  const path = `/api/battles/${randomUUID()}`,
    body = { revision: 0, replay: initial };
  assert.equal((await call(path, undefined, "PUT", body)).status, 401);
  assert.equal(
    (await call(path, alice, "PUT", body, { "X-Casper-User": bob.id })).status,
    409,
  );
  assert.equal(
    (await call(path, alice, "PUT", body, { Origin: "https://evil.test" }))
      .status,
    403,
  );
  assert.equal(
    (await call(path, alice, "PUT", { ...body, hp: 999 })).status,
    400,
  );
  assert.equal(
    (
      await call(path, alice, "PUT", {
        ...body,
        replay: {
          ...initial,
          actions: [
            { type: "attack", fighter: "FB05-030", target: "FB01-140" },
          ],
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(path, alice, "PUT", { ...body, extra: "x".repeat(40000) }))
      .status,
    413,
  );
});
test("battle isolation, idempotent retry, revision conflicts and immutable stats", async () => {
  const path = `/api/battles/${randomUUID()}`;
  const body = { revision: 0, replay: initial };
  const first = battleSummarySchema.parse(
    await (await call(path, alice, "PUT", body)).json(),
  );
  assert.equal(first.revision, 1);
  assert.equal((await call(path, bob)).status, 404);
  assert.deepEqual(
    ((await (await call("/api/battles", bob)).json()) as { battles: unknown[] })
      .battles,
    [],
  );
  assert.equal(
    battleSummarySchema.parse(
      await (await call(path, alice, "PUT", body)).json(),
    ).revision,
    1,
  );
  const replay = { ...initial, actions: [{ type: "charge" as const }] };
  assert.equal(
    (await call(path, alice, "PUT", { revision: 0, replay })).status,
    409,
  );
  assert.equal(
    (await call(path, alice, "PUT", { revision: 1, replay })).status,
    200,
  );
  assert.equal(
    (await call(path, alice, "PUT", { revision: 2, replay: initial })).status,
    409,
  );
  const old = battleSchema.parse(await (await call(path, alice)).json());
  await db.prepare("UPDATE special_attacks SET bonus = bonus + 1").run();
  try {
    const next = {
      ...replay,
      actions: [...replay.actions, { type: "charge" as const }],
    };
    assert.equal(
      (await call(path, alice, "PUT", { revision: 2, replay: next })).status,
      200,
    );
    const saved = battleSchema.parse(await (await call(path, alice)).json());
    assert.deepEqual(saved.catalog, old.catalog);
    assert.equal(
      restoreMatch(saved.replay, saved.catalog, saved.replay.catalogRevision)
        .move,
      3,
    );
  } finally {
    await db.prepare("UPDATE special_attacks SET bonus = bonus - 1").run();
  }
});
test("a finished replay is classified by the server and can be revisited", async () => {
  const catalog = catalogResponseSchema.parse(
    await (await call("/api/catalog")).json(),
  );
  const replay = structuredClone(initial);
  let state = restoreMatch(replay, catalog.cards, catalog.revision);
  while (!state.winner) {
    const action = chooseBotAction(state);
    replay.actions.push(replaySchema.shape.actions.element.parse(action));
    state = applyAction(state, state.turn, action);
  }
  const path = `/api/battles/${randomUUID()}`;
  const response = await call(path, alice, "PUT", { revision: 0, replay });
  assert.equal(response.status, 200);
  const saved = battleSummarySchema.parse(await response.json());
  assert.equal(saved.status, "completed");
  assert.equal(saved.result, state.winner);
});

test("new battles and writes are limited per account with retry guidance", async () => {
  const limited = await login("limited");
  const ids = Array.from({ length: 11 }, () => randomUUID());
  for (let i = 0; i < ids.length; i++) {
    const response = await call(`/api/battles/${ids[i]}`, limited, "PUT", {
      revision: 0,
      replay: initial,
    });
    assert.equal(
      response.status,
      i < 10 ? 200 : 429,
      await response.clone().text(),
    );
    if (i === 10) assert.equal(response.headers.get("retry-after"), "60");
  }
  // Retrying an existing save does not consume the new-battle allowance.
  for (let i = 11; i < 90; i++)
    assert.equal(
      (
        await call(`/api/battles/${ids[0]}`, limited, "PUT", {
          revision: 0,
          replay: initial,
        })
      ).status,
      200,
    );
  assert.equal(
    (
      await call(`/api/battles/${ids[0]}`, limited, "PUT", {
        revision: 0,
        replay: initial,
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await call(`/api/battles/${randomUUID()}`, bob, "PUT", {
        revision: 0,
        replay: initial,
      })
    ).status,
    200,
  );
});

test("atomic quota stops concurrent new saves without blocking existing battles or other accounts", async () => {
  const full = await login("quota");
  const seedId = randomUUID();
  assert.equal(
    (
      await call(`/api/battles/${seedId}`, full, "PUT", {
        revision: 0,
        replay: initial,
      })
    ).status,
    200,
  );
  await db.batch(
    Array.from({ length: 198 }, () =>
      db
        .prepare(
          "INSERT INTO battles SELECT user_id, ?, revision, replay, catalog, status, result, moves, created_at, updated_at FROM battles WHERE user_id = ? AND id = ?",
        )
        .bind(randomUUID(), full.id, seedId),
    ),
  );
  const responses = await Promise.all(
    [randomUUID(), randomUUID()].map((id) =>
      call(`/api/battles/${id}`, full, "PUT", { revision: 0, replay: initial }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 507]);
  assert.match(
    await responses.find((r) => r.status === 507)!.text(),
    /200 battles/,
  );
  assert.equal(
    (await db
      .prepare("SELECT count(*) AS n FROM battles WHERE user_id = ?")
      .bind(full.id)
      .first<{ n: number }>())!.n,
    200,
  );
  assert.equal(
    (
      await call(`/api/battles/${seedId}`, full, "PUT", {
        revision: 0,
        replay: initial,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(`/api/battles/${seedId}`, full, "PUT", {
        revision: 1,
        replay: { ...initial, actions: [{ type: "charge" }] },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(`/api/battles/${randomUUID()}`, bob, "PUT", {
        revision: 0,
        replay: initial,
      })
    ).status,
    200,
  );
});
test("sign-out revokes session immediately, including pending saves", async () => {
  assert.equal((await call("/api/auth/sign-out", bob, "POST", {})).status, 200);
  assert.equal((await call("/api/battles", bob)).status, 401);
  assert.equal(
    (
      await call(`/api/battles/${randomUUID()}`, bob, "PUT", {
        revision: 0,
        replay: initial,
      })
    ).status,
    401,
  );
  await db
    .prepare("UPDATE auth_session SET expires_at = 0 WHERE user_id = ?")
    .bind(alice.id)
    .run();
  assert.equal((await call("/api/battles", alice)).status, 401);
});
