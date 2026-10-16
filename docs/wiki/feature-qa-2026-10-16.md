# Live feature QA — October 16, 2026

Tested the running `http://127.0.0.1:4317/` cloud preview through the in-app browser with the user's existing Google account and the dedicated Casper D1 database. Separate test tabs preserved the original page. Restored the original two-card selection and sound setting after testing. Test battles and intentionally conflicting local branches remain in history; no user data was deleted.

## Live checks

| Feature | Observed result |
| --- | --- |
| Team selection | Two fighters cannot start; adding Piccolo to the 12-cost Goku/Broly lineup was rejected; adding Trunks made a valid 14-cost team |
| Special attacks | Kamehameha dealt 45; Spirit Bomb applied splash; Eraser Cannon dealt 54 plus 12 splash; Burning Slash dealt 27; used specials became unavailable |
| Combo and recovery | Broly plus Trunks dealt 59, knocked out its target and rested both fighters; charging restored readiness; last standing Trunks could attack each turn |
| Guard and energy | Charge capped energy at 6; Spirit Bomb was reduced from 56 to 42 through guard; Piccolo's Special Beam Cannon correctly ignored guard |
| Completion and rematch | Test match ended by knockout after 18 moves, well before the 60-turn cap; rematch reset all HP, energy and special flags |
| Autosave and refresh | UI confirmed online saves; refresh restored identical rendered turn, HP, energy, special flags and log |
| Cloud resume | Leaving and opening the unfinished record restored the exact board; another tab restored the same cloud match |
| Completed history | The 18-move defeat appeared in My battles and reopened its completed result |
| Concurrent tabs | A different action from a stale tab returned a visible conflict and retained its local branch; opening the cloud save recovered the newer board |
| Connection interruption | Paused only the local preview proxy for 22 seconds with automatic resume. Play continued and two moves remained local. Found and repaired the lost-response case described below |
| Sign-out | Account battles disappeared from guest history; guest play continued with local-save status |
| Return sign-in and guest import | Signed back into the existing Google identity. Account history returned without automatic guest upload. Explicit import saved the guest's two-move replay to D1 |
| Sound controls | Mute survived refresh and was restored to on. The live volume value remained 83. Audio synthesis paths are covered by automated tests; subjective audio quality was not evaluated |
| Collection pagination | Dragon Ball 50 loaded 24 then 48 items with 48 distinct asset links; switching to Dragon Ball 100 reset the list and loaded 24 items |
| Card details and shopping link | Details showed sourced stats and the custom ability. The exact Goku collectible link opened its matching Collector Crypt page with an offer button; no transaction was attempted |
| Rules | Rules dialog opened and closed correctly |

## Bug found and repaired

During the interruption, a request timed out in the browser but later committed one move to D1. The local replay already contained the bot's second move. Retrying both moves with the last acknowledged revision returned 409, even though the cloud history was a valid prefix of the local history.

`public/battle-sync.js` now reads the cloud save after a 409 and permits one retry with the current revision only when the catalog, teams, rules and every cloud action match the local replay prefix. Longer or divergent cloud histories remain conflicts. The server's revision checks and user isolation stay intact. Explicit retry can recheck a previously blocked local branch. Network failures now show a useful retry message instead of a raw timeout exception.

Retested the actual interrupted save after rebuilding and refreshing: both moves reached the cloud, the rendered board remained identical, and My battles showed two moves. Retried the deliberately divergent branch separately; it still returned a conflict and did not overwrite the completed cloud battle.

## Automated verification

`npm run check` and all **49 tests** passed after the fix. New tests cover lost acknowledgements, divergent histories, changed catalogs/teams, longer remote histories, bounded retries and identity-change rejection. Existing tests cover all eight specials, effects cancellation, simulated Google OAuth, D1 constraints, session revocation/expiry, input validation, account isolation, guest migration and all 1,296 ordered lineup pairings.

Cross-user isolation and expiry were tested in isolated D1 fixtures, not by creating another real Google account. No production deployment, ownership verification, checkout or multiplayer behavior was tested or added.
