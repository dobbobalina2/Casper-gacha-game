# Arena v2 — faster battles and combat feedback

Implemented October 16, 2026. Replaces [arena v1](arena-v1.md); printed card stats and collectible references remain unchanged.

## Combat

- Each fighter still starts with 100 HP; teams contain three different definitions within 14 printed cost.
- Base damage is **12 + round(printed power / 1,500)**. The flat component gives low-power support cards a viable finishing attack.
- Attack cost stays **max(1, ceil(printed cost / 3))**. Supporting costs one extra energy and adds printed combo power / 1,000 damage.
- Shared energy starts at 4, caps at 6, and recovers **2** at the start of each subsequent own turn. The opening player does not receive this recovery.
- Attackers and supporters rest through their next own turn while teammates are alive. **The last living fighter clears recovery at every own turn**, including when a teammate was just knocked out.
- Charge adds up to 3 energy and guards the next hit. Guard now blocks **25%** rather than 40%: floor(damage × 0.75), minimum 1. It does not stack.
- Knockout is the normal finish. The unchanged 60-total-turn limit still handles deliberate stalling, comparing total HP and drawing on a tie.
- The recommended lineup is Goku FB05-030, Piccolo SB02-043, and Gohan FB01-140. The bot fields Goku FB05-119, Piccolo SB02-043, and Goku FB05-030. Both spend the full 14-point budget. Existing selected teams remain selected.

## Balance evidence

`npm run balance` runs the deterministic bot policy on both sides for all nine legal lineups against all nine legal lineups: 81 ordered pairings, including nine mirrors. Each non-mirror pairing is played in both seats. Same policy in both versions; this measures pacing and seat outcomes, not human competitive balance.

| Metric | v1 | v2 |
| --- | ---: | ---: |
| Median total turns | 60 | 21 |
| Minimum / maximum turns | 47 / 60 | 19 / 29 |
| Matches reaching the cap | 46 / 81 | 0 / 81 |
| First seat wins | 50 / 81 | 43 / 81 |

Machine-readable [v1](../balance/arena-v1.json) and [v2](../balance/arena-v2.json) reports include per-team results. The v1 engine came from commit `095626e`; reproduce with `git show 095626e:public/engine.js > /tmp/casper-v1.mjs`, then `node scripts/balance.mjs /tmp/casper-v1.mjs`.

Lineups are not equally strong: the 8-cost starter wins only 1 of its 18 seat appearances, while the two Goku/Piccolo/heavy-hitter lineups win 16. The recommended team now spends the whole budget rather than steering players into the underpowered starter. More human playtesting and a wider roster are still needed. The first seat wins all nine identical-lineup mirrors under this deterministic policy; the aggregate does not establish perfect initiative fairness.

## Animation and audio

`public/effects.js` adds attack lunges, combo highlights and beams, hit flashes, damage/guard/KO labels, and charge pulses. Animations take roughly half a second, followed by a 350 ms bot pause. Reduced-motion preference removes movement, beams, and flashes, leaving a short damage-label fade.

Web Audio synthesizes separate strike, combo, impact, knockout, and charge sounds. Sound defaults to 35% volume and starts only after a pointer or keyboard gesture. Header mute and volume controls persist independently under `casper-audio-v1`. Unsupported or blocked audio cannot prevent combat.

Combat state commits synchronously and is saved before animation. Commands lock during playback. A match epoch prevents obsolete effect completions from resuming a departed match; effect generations prevent cancelled animations from cleaning up a new match's effects. Leaving cancels audio, overlays, animations, and the pending bot timer. Refresh restores the saved combat without replaying its sound or animation.

The existing practice storage key retains lineup choices. Replays require `arena-v2`; a v1 match resets with a visible message because old actions cannot faithfully reproduce under new damage rules.

## Verification

- 13 Node tests cover combat legality, damage, guard, recovery, last-survivor recovery, replay compatibility, all 81 ordered matchups, effect cancellation races, gesture-gated audio, persistent mute, and reduced motion.
- Syntax checks cover the engine, UI, and effects modules.
- Browser: observed beam, floating damage, locked attack controls, and a running AudioContext after a gesture. Mute and volume controls work; refresh preserves the match and mute setting. Actual acoustic quality has not been instrumentally measured.
- Completed a browser match against the earlier training lineup by knockout on turn 19; the full-budget matchup also ended by knockout on turn 19, with player 42 HP and bot 0 HP. No browser console errors were recorded.
- Verified leave/restart clears effects and keeps the new match at turn 1 with an empty log. At 390 px, document width is 390 px and sound controls fit the header.
