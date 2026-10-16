# Google accounts and battle saves

Implemented October 16, 2026 using Better Auth, Drizzle and Cloudflare D1. Google is the only enabled sign-in provider. Guest practice remains available.

## Local configuration

Create a Google OAuth **Web application** client. For this development server, configure:

- Authorized JavaScript origin: `http://127.0.0.1:4317`
- Authorized redirect URI: `http://127.0.0.1:4317/api/auth/callback/google`

Use that exact host and port when playing. `localhost` is a different origin. If Google's consent screen is in testing mode, add the intended player as a test user. Only the `openid`, `email` and `profile` scopes are requested.

Copy `.env.example` to `.dev.vars`, replace all placeholders, and keep that file private. Generate the Better Auth session secret independently of the Google client secret. `.dev.vars` is ignored by Git and loaded only by the Worker; neither secret belongs in browser bundles. The configured local file has owner-only permissions. Restart Wrangler after editing secrets.

```sh
npm run db:migrate         # Local D1
npm run db:migrate:remote  # Dedicated Casper cloud D1
npm run dev:cloud          # Local URL backed by real D1
```

For a future hosted deployment, set a new HTTPS `BETTER_AUTH_URL`, register its exact callback in Google and configure Worker secrets through Wrangler. Deployment is not part of this change. Do not copy the loopback URL into production.

## Storage and authentication

`src/auth.ts` builds Better Auth with an explicit trusted origin, signed HttpOnly SameSite=Lax cookies, seven-day sessions, disabled session-cookie caching, encrypted OAuth tokens, and database-backed auth rate limits. HTTPS deployments use secure cookies. Password login and automatic account linking are disabled. Better Auth handles OAuth state, PKCE, token verification and sign-out. Drizzle transactions are disabled because D1 does not support the interactive transactions that adapter would otherwise issue. The Worker requires `nodejs_compat`.

Migration `0002_pale_changeling.sql` adds `auth_user`, `auth_account`, `auth_session`, `auth_verification`, `auth_rate_limit` and `battles`. Foreign keys tie sessions, provider accounts and battles to users. The battle primary key contains both user ID and battle ID.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/auth-status` | Whether valid server-side login configuration exists; returns no credentials |
| `/api/auth/*` | Better Auth Google sign-in, callback, session and sign-out handlers |
| `GET /api/battles` | Signed-in user's latest 20 battle summaries |
| `GET /api/battles/:id` | That user's replay and original stat snapshot |
| `PUT /api/battles/:id` | Validate and save `{revision, replay}`; maximum body size 32 KiB |

Battle endpoints require a real session and an `X-Casper-User` header matching its user ID. The header prevents a pending request from being reassigned when a browser cookie changes accounts; it never authenticates a request by itself. Writes also require the configured Origin. Responses are not cacheable. Invalid bodies, missing sessions, cross-account reads and conflicting histories fail closed.

## Save and resume behavior

Starting a match allocates a UUID. Every legal action is stored locally before its animation, then queued for an account save. The server supplies the catalog snapshot for new battles and reconstructs state from legal actions; it does not accept client HP, results or custom stats. Existing battles retain that snapshot after catalog updates. These are practice results, not proof of competitive play or ownership.

Saves use optimistic revisions and append-only action histories. Retrying an identical replay after a lost response is idempotent. A conflicting history returns 409 and remains a separate local branch. The queue coalesces moves while a request is in flight and keeps unsent moves after a late acknowledgement. It retries on reconnect or **↻ Save**; it does not silently overwrite the cloud save.

**My battles** lists recent cloud saves plus local guest or pending branches. Opening a cloud save lets the player resume its current history; conflicted local backups remain available separately. Completed battles reopen their results. Leaving a match retains its save. A tab refresh restores its active local match, including its original stats. New tabs and devices can use My battles to resume cloud progress.

Browser backups are partitioned by authenticated user ID. A guest replay is never automatically attached to a Google account; the player can choose **Import latest guest battle**. Old anonymous local-storage replays migrate to guest backups. Local backups remain on the device after sign-out and are only shown in the app after the same account signs back in. They are not encrypted browser storage. Storage failure is visible; keep the tab open until an online save is confirmed. The latest 20 local branches are displayed, and no background cleanup deletes pending backups.

## Verification and limits

All 46 tests passed, including an isolated Worker/D1 OAuth exchange with a test RSA-signed Google ID token, PKCE/state cookies, encrypted token storage, two users, session revocation/expiry, origin checks, input bounds, legal-action validation, revision conflicts, immutable snapshots and completed results. Queue tests cover late acknowledgements, offline retry, retained conflicts and stopping writes on account changes. Client tests cover guest refresh recovery, explicit guest import, separation between users and storage failure. Strict TypeScript and frontend syntax checks passed.

The additive migration was applied to local and dedicated cloud D1. The running cloud preview reported login enabled and generated a Google authorization URL with the exact callback, state and PKCE. The login controls were visible in the browser. Completing a real Google sign-in and visually checking authenticated battle resume remain a user verification step: browser QA was interrupted by the locked Mac. No production deployment or authenticated collectible-ownership integration is included.

References: [Better Auth Google provider](https://better-auth.com/docs/authentication/google), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [session management](https://better-auth.com/docs/concepts/session-management).
