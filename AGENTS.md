# AGENTS.md — Đảo Đèn Lồng (AI SDLC · Contract v1.2)

## Stack & Commands
- Stack: TypeScript + Vite + Three.js (3D UI) + Node.js (Headless CLI) + Vitest.
- Install & Build: `npm ci && npm run build`
- Typecheck: `npm run typecheck`
- Unit & Contract Tests: `npm test`
- Full Verification + Evidence: `npm run verify`
- Play GUI: `npm run start` (hoặc `npm run dev`)
- Headless CLI: `node dist/headless.mjs --seed <int> --night <1|2|3> --ticks <int> --out <file.jsonl>`

## Architecture Rules
1. **Strict core/render separation:** `src/core/` MUST NOT import `three`, `window`, `document`, or browser APIs. All gameplay logic runs deterministically at 60Hz (`DT = 1/60`) in `src/core/`.
2. **Single source of truth for tuning:** `src/core/config.ts` imports `tuning` directly from `game.contract.json` (v1.2). Never hardcode diverging tuning numbers.
3. **Determinism & integer fuel:** Never use `Math.random()` or `Date.now()` in `src/core/`. Store lantern fuel in integer 1/60 units (`fuel60` in `0..6000`) to avoid float drift; round to 1 decimal only on JSONL output.
4. **Test Contract v1.2 invariants:**
   - Exact tick order: input/pause → timers & fuel decay/drain → lantern out (`fuel <= 0`) → player move/dash/pad/wind/fall → pickup motes & charms → lantern interact (light/relight/refuel) → safe zone (only `fuel >= 30`) → pulse (3D from Y+0.8) → shades (`spawning/wander/chase/recoil/stunned/drain`) & drifters move → contacts (drifters first, then shades by ascending id) → scheduled spawns → win/lose (`no_flames` > `dawn_survived` >= `ceil(0.6*N)` > `dawn`) → snapshot.
   - Capacity scales: `min(20, 10 + 2 * successful_lights)`.
   - Score: `+5` per deposited/refueled mote, `+100` first light, `+40` relight, `+5` stun (`+15` if draining), dawn win bonus `sum(50 + floor(fuel)) + flames * 50`.
   - Malformed `--inputs` or `--scenario` files MUST exit with code `2` and print to `stderr`.
   - Creative visual/audio additions live ONLY in `src/render/` and NEVER alter headless output.

## Verification Gate
- Never declare a phase or change complete until `npm run verify` passes (typecheck + build + unit/regression tests + Phase 3 Contract v1.2 scenarios + perf benchmark + determinism check).
- Never silently skip broken tests from earlier phases — update or remove with documented rationale in `CHANGELOG.md` and `docs/notes/`.
