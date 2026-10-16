# Public deployment

Casper is hosted at https://casper-gacha-game.jfkiii.workers.dev. The private source repository is https://github.com/dobbobalina2/Casper-gacha-game on `main`.

## Runtime and updates

Cloudflare Worker `casper-gacha-game` serves the built static assets and API using the existing dedicated `casper-arena` D1 database. Production and `dev:cloud` share that database, including account and battle records; local development uses its separate local D1 copy. Do not use destructive test fixtures against the shared cloud database.

`wrangler.jsonc` sets the public HTTPS `BETTER_AUTH_URL`, enables the stable workers.dev route, and disables version preview URLs. Local `.dev.vars` overrides the base URL for development. Credentials and generated build files are excluded from Git.

```sh
npm ci
npm run check
npm test
npm run db:migrate:remote  # Only after reviewing pending migrations
npm run deploy            # Build assets, then deploy Worker and assets
```

Deployments are manual; pushing to GitHub does not deploy automatically. D1 migrations are additive and are not automatically applied by `npm run deploy`. Review `wrangler deployments list` before a rollback; code rollback does not revert database migrations.

## Production Google login

The existing `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` were uploaded as Cloudflare Worker secrets with explicit user approval. Preserve the existing Better Auth secret because the shared D1 provider tokens are encrypted with it. Do not put secret values in Wrangler configuration, Git, browser assets, or documentation.

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
