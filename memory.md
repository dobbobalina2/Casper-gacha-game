# Recurring integration pitfalls

- Collector Crypt's Dragon Ball inventory sample mixes fighter candidates and energy markers; `Type: Card` is not a gameplay type. Match an official card definition before making an item playable.
- Inventory names may be truncated or omit the card-number separator. Preserve the original asset identity and text; do not resolve cards using character name alone.
- Grading, insured value, and gacha rarity are not combat stats. The first 12 Dragon Ball records inspected did not expose structured power, cost, or combo power in their attributes or content metadata; source and verify those separately.
- Collector Crypt image URLs have no extension; the six downloaded assets were WebP. Use the response content type rather than assuming JPEG.

- Recovery plus guarding can create long one-fighter endgames. Keep all-lineup knockout pacing checks when changing damage or recovery, and inspect per-team results rather than only aggregate wins.
- Cancelled animation promises can settle after a new match starts. Guard both the UI continuation and effect cleanup with generation tokens; save combat before presentation begins.

- Collector Crypt gacha inventory is not a sale listing. Use the exact asset page for availability; never label insured value as the purchase price. Preserve opaque inventory cursors unchanged and deduplicate by mint, not card definition.

- Changing database-backed stats can change deterministic replay outcomes. Bind saved matches to the validated catalog revision and retain the immutable stat snapshot for resume. Older saves without a compatible snapshot must fail closed.
- Wrangler local D1 and remote D1 have separate state. Explicitly verify the database binding and migration target; a successful local migration is not evidence of a remote migration.
- In this environment Wrangler remote D1 bindings in a local Worker failed with `Network connection lost`, while `wrangler dev --remote` served the same D1 queries successfully. Use the authenticated remote preview for cloud-backed local QA; keep ordinary `npm run dev` local.

- A session cookie can change while another tab has queued battle writes. Bind requests to the expected user ID as well as the authenticated session, and use a revision check to prevent overwriting another tab. Keep failed local branches separately.
- Better Auth with Drizzle D1 requires `transaction: false`, `nodejs_compat`, and the complete core schema, including an ID and unique key on the database rate-limit table. Test the OAuth callback in the Worker runtime, not just URL generation.

- A timed-out save can still commit to D1. If later local actions are queued, retrying with the last acknowledged revision produces a false conflict. Recover by reading the cloud replay and rebasing once only when its complete history, teams and catalog are a prefix of the local replay. Never treat all 409 responses as permission to overwrite. Verify with a real proxy interruption as well as mocked failures.

- Never put secret search values in child-process arguments: execution errors can echo the full command. Feed patterns through stdin, use non-throwing status handling for expected no-match results, and report only counts/redacted diagnostics.

- Cloudflare rate-limit namespaces are shared by ID and enforced per location. Give staging distinct IDs; use a D1 trigger for the strict per-account storage cap. A select/count followed by insert alone races under concurrent requests.
- A storage-quota failure must pause only the rejected new save, not stop the whole browser queue. Avoid opening an empty drain promise for paused records: a same-tick enqueue could otherwise miss its flush.

- React effect cleanup must dispose the account service before asynchronous initialization completes; otherwise Strict Mode remounts can start duplicate save queues. Preserve captured account headers on retries and invalidate late history responses when the dialog closes.
