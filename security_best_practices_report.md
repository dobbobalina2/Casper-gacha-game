# Casper security review — October 16, 2026

> Historical record: this review describes the original deployment before the React/TypeScript history reconstruction. Its commit IDs, line numbers, source paths, and live observations refer to the original history retained in the local backup; they are not fresh verification of reconstructed commits.

**Remediation update:** Findings 2–4 and the source-folder cleanup are implemented and deployed. See [security hardening](docs/wiki/security-hardening.md) for controls, verification and limits. Finding 1 (production credential rotation) remains open. The original review below retains its commit-specific paths and evidence.

Reviewed commit `2d62561` and the live HTTPS deployment. This was a bounded source/configuration review with non-destructive HTTP checks, dependency audit, secret scanning, and 21 isolated integration/client tests. No application code or production settings were changed. No load testing or account-data extraction was performed.

The reviewed paths did not reveal an authentication bypass, cross-user battle access, deployed server-source exposure, or browser-bundled credentials. There is one high-priority credential-handling issue, two medium-priority operational/abuse issues, and one low-priority browser-hardening issue. This is not a comprehensive penetration test or a guarantee of security.

## High priority

### 1. Rotate credentials that entered conversation/tool output

- **Rule:** Secret handling; operational exposure, not a demonstrated public-site leak.
- **Evidence:** The Google OAuth client secret was supplied in this conversation. During the preceding deployment work, an agent's `execFileSync` error also printed a command containing the Better Auth secret. No secret values are reproduced here. The application consumes these secrets at `src/auth.ts:39` and `src/auth.ts:49`; the Better Auth key also protects provider tokens (`src/auth.ts:55`).
- **Impact:** Someone with access to those conversation/log records could obtain authentication credentials or cryptographic key material; the exact downstream impact depends on additional access and protocol protections.
- **Remediation:** Replace the Google OAuth secret, update local and Cloudflare secret stores, and revoke the old Google secret after verification. Plan Better Auth key rotation with its encrypted-token/session behavior: preserve account and battle records, migrate or retire encrypted provider-token material, and require reauthentication where necessary. Do not simply replace its encryption key without accounting for stored ciphertext.
- **Mitigation/limits:** Both configured secret values were absent from all 12 Git commits and all built browser assets. Secret URLs returned 404. There is no evidence of unauthorized use or exposure through GitHub/the public site. Rotation has not been performed by this review.

## Medium priority

### 2. Application APIs lack request limits and battle-storage quotas

- **Rule:** Resource consumption / abuse prevention.
- **Evidence:** Better Auth's limiter is configured at `src/auth.ts:61`, but custom battle routes call `auth.api.getSession` and proceed without their own limiter (`src/worker.ts:74–105`). New UUIDs insert new full catalog/replay records without a per-user cap (`src/battles.ts:95–129`). The `.limit(20)` at `src/battles.ts:37` limits returned history, not stored rows. Anonymous catalog/inventory routes also lack application-level request limits (`src/worker.ts:150–177`). Distinct allowed cursors create distinct inventory cache keys and can force upstream requests (`src/inventory.ts:76–96`).
- **Impact:** An ordinary signed-in account can automate new saves and grow D1 storage; unauthenticated traffic can consume catalog queries and inventory upstream work. This can exhaust service quotas or raise resource usage for legitimate players.
- **Remediation:** Add per-account battle-write/new-match limits and a concurrency-safe saved-battle quota. Add edge/IP rate limits for public APIs, with stronger limits on inventory cache misses. Preserve pending saves and return usable 429/retry guidance. Configure Better Auth's trusted Cloudflare client-IP header explicitly rather than leaving its proxy interpretation implicit.
- **Mitigation/limits:** 32 KiB save bodies, 60-action replays, 24-item inventory responses, timeouts and bounded cache storage already limit individual requests. The Better Auth limiter does not cover server-side `auth.api` calls, as documented in its [rate-limit reference](https://www.better-auth.com/docs/concepts/rate-limit). Cloudflare account-level WAF/rate-limit rules were not audited; absence of an application limiter is confirmed, successful large-scale abuse is not. No production flood or bulk-save test was attempted.

### 3. Cloud development shares production data and auth credentials

- **Rule:** Environment isolation.
- **Evidence:** A single D1 binding is configured at `wrangler.jsonc:16–22`; `docs/wiki/deployment.md:7` explicitly states that production and `dev:cloud` share accounts and battles. Production also reuses the local Better Auth key (`docs/wiki/deployment.md:23`) and Google OAuth client.
- **Impact:** A future experimental cloud-preview build or mistaken remote migration can read or mutate friends' production records. Sharing the encryption key increases the consequences of a development credential leak.
- **Remediation:** Give development/staging separate D1 bindings, auth secrets and preferably separate Google OAuth clients. Make environment selection explicit in scripts and reserve the current database for production. Seed staging from non-personal fixtures rather than copying users and sessions.
- **Mitigation/limits:** Ordinary `npm run dev` uses separate local D1; tests use isolated databases. This finding concerns cloud preview and operational mistakes, not an unauthenticated remote database exploit.

## Low priority

### 4. Public HTML lacks CSP and framing protection

- **Rule:** JS-CSP-001 / defense in depth.
- **Evidence:** Live GET `/` returned neither `Content-Security-Policy` nor `X-Frame-Options`; `X-Content-Type-Options` was also absent on HTML/JS assets. `public/index.html:3–8` has no CSP meta policy. Static assets are served directly from `dist/client` (`wrangler.jsonc:9–14`), bypassing API response headers. The JSON helper's `nosniff` at `src/worker.ts:134` does not cover them.
- **Impact:** The site can be framed, and a future HTML-injection bug would lack a CSP layer limiting script execution. Current SameSite cookies reduce cross-site authenticated framing risk; no working XSS or harmful clickjacking chain was demonstrated.
- **Remediation:** Add static asset response headers (for example a reviewed `_headers` file) with a restrictive script policy, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, and `nosniff`. Scope image/style/connect sources to actual requirements. Test dynamic styles, artwork, audio and Google login before enforcing the policy; do not blindly add `unsafe-eval` or break the existing inline-style presentation.

## What `public/` actually contains

`public/` contains browser UI code, combat/replay logic, audio/animation code, HTML, CSS and images. It does **not** contain the server's authentication implementation, secret values, database adapter or battle authorization queries. Those live under `src/` and run in Cloudflare's Worker.

There is a real organizational shortcut: `scripts/build.mjs:6` copies the entire folder, then `scripts/build.mjs:7–14` bundles `public/app.js`. Consequently redundant raw browser modules, including `/account.js`, are served alongside the bundle. Those raw files contain imports intended for the build step. `/account.js` returned 200, while `/src/auth.ts`, `/src/worker.ts` and the tested migration URL returned 404. Exposing browser code is normal; the redundant copies are unnecessary and make the boundary less clear.

Recommended organization:

```text
src/client/   UI, account controls, audio and animation
src/shared/   replay engine and Zod contracts needed by both runtimes
src/server/   Worker, authentication, database and API handlers
public/       static images and other copied assets only
dist/client/ generated HTML, CSS, bundled JS and assets (not committed)
```

Moving source directories improves maintainability and reduces accidental copying. It does not hide browser logic: every browser app ships executable client code. Server-side session checks, ownership checks and validation remain the security boundary.

The replay validator accepts legal actions for both teams (`public/engine.js:275–290`). A modified client can therefore manufacture a legal practice result or choose weak bot moves. This is compatible with the documented no-prizes practice game; do not reuse it as competitive authority for rankings, rewards, ownership or purchases without server-controlled matches.

## Verification and positive controls

- `npm audit --json`: zero reported vulnerabilities in the installed lockfile (36 production dependencies reported). This is an advisory check, not proof dependencies are flawless.
- All 21 selected tests passed: accounts, database, inventory and account client. They cover two-user separation, session revocation/expiry, write origins, schema/body limits, invalid actions, immutable snapshots, conflicts, foreign keys, SQL quoting, URL validation and guest/account separation. Tests use isolated D1 and test-signed Google identities.
- Live anonymous `/api/battles`: 401; `/api/auth/get-session`: 200 with no authenticated session. Responses use `Cache-Control: no-store`; no permissive CORS header was observed.
- An external OAuth callback URL was rejected with 403. A cookie-less non-browser request with a trusted callback and external Origin was allowed to initiate OAuth: installed Better Auth deliberately treats that differently from a cookie-authenticated request. This observation alone is not evidence of a CSRF bypass; state/PKCE, cookies and browser fetch metadata still apply.
- `/src/auth.ts`, `/src/worker.ts`, `/db/migrations/0002_pale_changeling.sql`, `/.dev.vars` and `/.git/config`: 404.
- Configured Google/Better Auth secret values: zero matches across all 12 Git commits and built browser files. Do not pass secret search patterns in child-process arguments: exceptions can echo arguments. Use stdin, bounded output and redacted error handling.
- Battle queries are scoped by authenticated user ID, updates use revision checks, and the server supplies/validates immutable stats before replaying actions.
- Account names and inventory text are HTML-escaped in reviewed rendering paths. IDs/local artwork paths/colors are restricted by schemas; external collectible images use an HTTPS host allowlist. No working attacker-controlled HTML/script injection path was established.
- No private player data, real cookies or token values were copied into this report. Live attack-volume behavior, Cloudflare account permissions, and exhaustive third-party internals were outside scope.

Recommended order: rotate exposed credentials carefully; add API quotas/limits and environment isolation; apply browser headers; then clean up the source layout. This original review recorded findings before remediation; current status is documented at the top of this file.
