# Security hardening and source layout

Implemented October 16, 2026 following the [security review](../../security_best_practices_report.md). This closes findings 2–4 and removes redundant raw client modules from the deployed asset directory. The production credential-rotation finding remains open and was outside this change.

## Source boundaries

```text
src/client/    Browser UI, account controls, animations and audio, HTML/CSS
src/shared/    Deterministic replay engine, special helpers and Zod contracts
src/server/    Worker routes, Better Auth, Drizzle tables and D1 queries
public/        Images and static response-header configuration
scripts/       Build, catalog import and balance tools
db/migrations/ Versioned schema/data and the atomic battle-quota trigger
dist/client/  Generated browser bundle, HTML, CSS and assets (ignored)
```

The build copies static assets and HTML/CSS, then bundles `src/client/app.js` into one browser entry. Shared code is included only where imported. Backend source and credentials never enter the browser build. `/account.js` and `/engine.js` now return 404; `/app.js` remains the public browser bundle.

## Abuse controls

| Boundary | Limit |
| --- | --- |
| All `/api/*`, before database/auth work | 180 requests/minute per Cloudflare client IP |
| Inventory, including cached/invalid queries | 30 requests/minute per IP |
| Battle writes after authentication/origin checks | 90 writes/minute per account |
| New battle attempts after input/revision checks | 10/minute per account |
| Stored battles | 200 per account, atomically enforced by D1 trigger |

The Worker and Better Auth explicitly use `CF-Connecting-IP`; changing `X-Forwarded-For` cannot reset the application limiter. Cloudflare binding limits are approximate and per location, not global billing caps. The database quota is exact even for simultaneous inserts. Retrying/resuming an existing battle does not consume a new slot. There is no automatic deletion or battle-deletion endpoint.

Throttled requests return 429, `Retry-After: 60` and a retry message. Saves retain browser backups and coalesce new moves during cooldown before retrying; stopping the account queue cancels pending retries. Unavailable/missing limiter bindings fail closed with 503. Full storage returns 507, retains the browser copy, and does not block existing battles or other users.

## Environment isolation

Production uses `casper-arena`. `npm run dev:cloud` explicitly selects staging and uses `casper-arena-staging`, separate rate-limit namespaces and `.dev.vars.staging`. Staging was seeded from catalog/schema migrations only, without copying production users, sessions or battles. Its public workers.dev and version-preview URLs are disabled. Local D1 has another independent Better Auth key in `.dev.vars`. Production's existing key was preserved to keep existing encrypted provider tokens usable.

The current Google OAuth client remains shared, with the previously authorized localhost and production callbacks. Separate Google clients remain a recommended future refinement; the D1 databases and Better Auth encryption/session keys are now independent. Do not copy production keys into development. Use explicit `db:migrate:staging` and `db:migrate:production` scripts; deployment explicitly selects the top-level production environment.

## Browser headers

`public/_headers` applies CSP and framing protection to static responses. Scripts and connections are same-origin; object embeds and framing are blocked. Images are restricted to local/data sources and the same three hosts allowed by Zod. Google Fonts CSS/font origins are allowed. Inline styles remain allowed for existing HP bars, card visuals and animation styling; inline scripts and eval are not enabled. HTML and assets receive `nosniff`, `DENY`, a referrer policy and disabled camera/microphone/geolocation permissions.

## Verification

- All 57 tests and TypeScript/frontend checks passed. New tests cover IP isolation, spoofed forwarding headers, missing limiter bindings, account write/new-match limits, simultaneous inserts at the 200-row cap, existing-save retries at capacity, other-user independence, cooldown/cancellation with retained browser moves, and continued existing-battle saves while new saves are at quota.
- Dependency audit: zero reported vulnerabilities.
- Staging migrations applied to a fresh database. Real Google sign-in returned to localhost and My battles showed no production history.
- Production migration `0003_battle_quota.sql` applied; deployed Worker version `708f08c3-75d5-4526-afef-8f940a8fa3ae`.
- Live HTTPS HTML returned the CSP, framing and nosniff headers. Catalog returned eight cards; login remained enabled; anonymous battle access returned 401. Raw module URLs, server source, secret files and Git configuration returned 404.
- Production retained its signed-in session. Live inventory loaded 24 collectibles, artwork rendered and no browser errors were captured. Kamehameha and the bot's Spirit Bomb completed, autosaved, and reopened from My battles at turn 3 with both specials used.
- Before publication, all 13 preceding commits, the working tree and browser assets were checked for configured development/Google secret values, common credential signatures and private/generated files in history: zero matches. The prior review separately checked the unchanged production Better Auth key. No real cookies, provider tokens or player records were exported into the repository.

This is bounded regression verification, not a penetration test. Production flooding was not performed; rate/quota stress cases ran in isolated local D1 runtimes. Audio scheduling and all eight animation paths are covered by automated tests; audible playback was not independently measured in the live check.
