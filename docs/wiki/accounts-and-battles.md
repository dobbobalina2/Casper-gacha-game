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
npm run db:migrate:staging # Isolated staging cloud D1
npm run dev:cloud          # Local URL backed by staging D1
```

The public site is now deployed. Its HTTPS base URL and production Google configuration are documented in the [deployment runbook](deployment.md). Local credentials remain in `.dev.vars`; cloud preview uses `.dev.vars.staging`. Generate an independent Better Auth key in each file. Wrangler does not merge `.dev.vars` into `.dev.vars.staging`, so the staging file needs all four settings. Both files are ignored and owner-only; production secrets remain in Cloudflare. Changing a development key requires signing in again. The existing Google OAuth client is still shared; separate clients are preferable when staging gets its own public hostname.

## Storage and authentication

`src/server/auth.ts` builds Better Auth with an explicit trusted origin, signed HttpOnly SameSite=Lax cookies, seven-day sessions, disabled session-cookie caching, encrypted OAuth tokens, and database-backed auth rate limits. HTTPS deployments use secure cookies. Password login and automatic account linking are disabled. Better Auth handles OAuth state, PKCE, token verification and sign-out. Drizzle transactions are disabled because D1 does not support the interactive transactions that adapter would otherwise issue. The Worker requires `nodejs_compat`.

Migration `0002_pale_changeling.sql` adds `auth_user`, `auth_account`, `auth_session`, `auth_verification`, `auth_rate_limit` and `battles`. Foreign keys tie sessions, provider accounts and battles to users. The battle primary key contains both user ID and battle ID.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/auth-status` | Whether valid server-side login configuration exists; returns no credentials |
| `/api/auth/*` | Better Auth Google sign-in, callback, session and sign-out handlers |
| `GET /api/battles` | Signed-in user's latest 20 battle summaries |
| `GET /api/battles/:id` | That user's replay and original stat snapshot |
| `PUT /api/battles/:id` | Validate and save `{revision, replay}`; maximum body size 32 KiB |

Battle endpoints require a real session and an `X-Casper-User` header matching its user ID. The header prevents a pending request from being reassigned when a browser cookie changes accounts; it never authenticates a request by itself. Writes also require the configured Origin. Responses are not cacheable. Invalid bodies, missing sessions, cross-account reads and conflicting histories fail closed.

## Limits

Cloudflare rate-limit bindings allow 180 API requests/minute per IP, with a separate 30/minute inventory limit, 90 battle writes/minute per signed-in user and 10 new-battle attempts/minute per user. These are approximate per-location limits, not global billing caps. Only Cloudflare’s `CF-Connecting-IP` header is trusted. Missing/failing bindings return 503; denied requests return 429 with `Retry-After: 60`. The save queue retains browser backups, coalesces moves during cooldown, and retries once cooldown expires; signing out cancels that timer.

Migration `0003_battle_quota.sql` adds an atomic SQLite trigger capping each account at 200 stored battles, including simultaneous inserts. New saves at the cap return 507 with a browser-backup message. Existing saves, idempotent retries and other users are unaffected; there is no automatic deletion. The latest-20 history query is a display limit, not the storage cap.

## Save and resume behavior

Starting a match allocates a UUID. Every legal action is stored locally before its animation, then queued for an account save. The server supplies the catalog snapshot for new battles and reconstructs state from legal actions; it does not accept client HP, results or custom stats. Existing battles retain that snapshot after catalog updates. These are practice results, not proof of competitive play or ownership.

Saves use optimistic revisions and append-only action histories. Retrying an identical replay after a lost response is idempotent. A conflicting history returns 409 and remains a separate local branch. If a timed-out request reached D1 but its acknowledgement was lost, the client reads the cloud replay and retries once with its revision only when that entire history is an exact prefix of the pending local replay. Different actions, teams or catalog revisions never rebase. Explicit **↻ Save** also retries retained conflicts through this same check. The queue coalesces moves while a request is in flight and keeps unsent moves after a late acknowledgement. It retries on reconnect or **↻ Save**; it does not silently overwrite the cloud save.

**My battles** lists recent cloud saves plus local guest or pending branches. Opening a cloud save lets the player resume its current history; conflicted local backups remain available separately. Completed battles reopen their results. Leaving a match retains its save. A tab refresh restores its active local match, including its original stats. New tabs and devices can use My battles to resume cloud progress.

The client account module is a typed service with no account-page DOM ownership. It publishes user, availability, status and battle-history snapshots for React to render, and exposes explicit actions to open a saved battle, import a guest save, retry, sign in or sign out. React owns history-dialog presentation and subscribes through the service callback.

Browser backups are partitioned by authenticated user ID. A guest replay is never automatically attached to a Google account; the player can choose **Import latest guest battle**. Old anonymous local-storage replays migrate to guest backups. Local backups remain on the device after sign-out and are only shown in the app after the same account signs back in. They are not encrypted browser storage. Storage failure is visible; keep the tab open until an online save is confirmed. The latest 20 local branches are displayed, and no background cleanup deletes pending backups.

## Verification and limits

All 49 tests passed, including an isolated Worker/D1 OAuth exchange with a test RSA-signed Google ID token, PKCE/state cookies, encrypted token storage, two users, session revocation/expiry, origin checks, input bounds, legal-action validation, revision conflicts, immutable snapshots and completed results. Queue tests cover late acknowledgements, offline retry, retained conflicts and stopping writes on account changes. Client tests cover guest refresh recovery, explicit guest import, separation between users and storage failure. Strict TypeScript and frontend syntax checks passed.

The additive migration was applied to local and dedicated cloud D1. The running cloud preview reported login enabled and generated a Google authorization URL with the exact callback, state and PKCE. The login controls were visible in the browser. Live browser QA subsequently verified real Google sign-in, sign-out, guest separation/import, unfinished and completed battle resume, exact refresh recovery, two-tab conflicts and a real preview-proxy interruption. That interruption exposed a lost-acknowledgement recovery issue; the fix was retested against the retained live save. See the [feature QA results](feature-qa-2026-10-16.md). Production deployment, real Google sign-in and live account-save verification are documented in the [deployment runbook](deployment.md). Authenticated collectible-ownership integration is not included.

References: [Better Auth Google provider](https://better-auth.com/docs/authentication/google), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [session management](https://better-auth.com/docs/concepts/session-management).
