# Public deployment

Casper is hosted at https://casper-gacha-game.jfkiii.workers.dev. The source repository is https://github.com/dobbobalina2/Casper-gacha-game on `main`.

## Runtime and updates

Cloudflare Worker `casper-gacha-game` serves the built static assets and API using the existing dedicated `casper-arena` D1 database. Production exclusively uses that database. `dev:cloud` selects `--env staging`, with a separate `casper-arena-staging` D1 database, independent rate-limit namespaces and `.dev.vars.staging` auth key. Local development has its own D1 copy and key. Staging disables public workers.dev and version-preview routes. Never copy production users or sessions into test fixtures.

`wrangler.jsonc` sets the public HTTPS `BETTER_AUTH_URL`, enables the stable workers.dev route, and disables version preview URLs. Local `.dev.vars` and cloud-preview `.dev.vars.staging` use the localhost base URL and different development keys. Credentials and generated build files are excluded from Git.

```sh
npm ci
npm run check
npm test
npm run db:migrate:staging    # Verify new migrations on staging first
npm run db:migrate:production # Only after tests and migration review
npm run deploy            # Build assets, then deploy Worker and assets
```

Deployments are manual; pushing to GitHub does not deploy automatically. D1 migrations are additive and are not automatically applied by `npm run deploy`. Review `wrangler deployments list` before a rollback; code rollback does not revert database migrations.

## Production Google login

The existing `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` were uploaded as Cloudflare Worker secrets with explicit user approval. Preserve the existing Better Auth secret because production D1 provider tokens are encrypted with it. Do not put secret values in Wrangler configuration, Git, browser assets, or documentation.

The following entries were saved in the existing Casper Google OAuth Web application client with user approval; local entries were preserved:

- Authorized JavaScript origin: `https://casper-gacha-game.jfkiii.workers.dev`
- Authorized redirect URI: `https://casper-gacha-game.jfkiii.workers.dev/api/auth/callback/google`

The Google Auth Platform audience was verified as External and In production. No audience or scope changes were made. The Worker requests only basic identity scopes. A real Google sign-in on the public domain completed in Chrome. A new two-move battle saved online, appeared beside existing account history, and reopened from its cloud record at turn 3 with the same HP, energy and special-use flags.

## Deployment verification, October 16, 2026

- Wrangler confirmed all remote D1 migrations already applied.
- Build, all 49 tests, and TypeScript/frontend syntax checks passed.
- Stable public HTTPS page and catalog returned successfully, with eight validated cards.
- Browser guest battle: Kamehameha dealt 45 damage; bot Spirit Bomb dealt 56 damage plus splash; turn 3, HP, energy, and used-special flags survived refresh.
- After secrets were uploaded, `/api/auth-status` returned `enabled: true`; anonymous `/api/battles` returned 401. Google sign-in generated the exact HTTPS callback, PKCE, and Secure cookies.
- Real Google authorization returned to the public app with a signed-in session. A new production battle and special attack were saved online; My battles listed the two-move record and reopened it with the expected turn, HP and special-use flags.
- Live inventory loaded 24 collectibles and paginated to 48; browser error logs were empty.
- `/.dev.vars` and `/.env` returned 404.
- The initial 11-commit Git history was scanned for both configured secret values; no matches or tracked secret/generated directories were found. GitHub repository is private.

Full gameplay/account regression evidence from before deployment is in [feature QA](feature-qa-2026-10-16.md). No game logic changed during deployment.

## Security release

The subsequent hardening release separates staging from production, adds edge limits and the database battle quota, and deploys CSP/security headers. Source now lives under `src/client`, `src/shared` and `src/server`; only static assets and headers live in `public`. See [the release verification and remaining limitations](security-hardening.md). The source repository is published publicly after the security checks; secrets and player data remain outside Git.
