# AGENTS.md — Đảo Đèn Lồng (AI SDLC · Contract v1.1)

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
2. **Single source of truth for tuning:** `src/core/config.ts` imports `tuning` directly from `game.contract.json` (v1.1). Never hardcode diverging tuning numbers.
3. **Determinism:** Never use `Math.random()` or `Date.now()` in `src/core/`. Always use `SeededRNG` (`src/core/prng.ts`).
4. **Test Contract v1.1 invariants:**
   - Exact 12-step tick order: input/pause → timers → player move/dash/pad/wind/fall → pickup motes & charms → lantern interact → safe zone → pulse (3D from Y+0.8) → shades & drifters move → contacts (drifters first, then shades by ascending id) → scheduled spawns → win/lose → snapshot.
   - Shade states MUST use exact names: `spawning`, `wander`, `chase`, `recoil`, `stunned`.
   - Drifter states: `idle`, `chase`, `flee`, `removed`.
   - Score: `+10` per deposited mote, `+100` per lit lantern, `+5` per stunned shade, win bonus `floor(time_left_s)*2 + flames*50`.
   - When paused: `tick` increments, `sim_tick` and all timers freeze, snapshot `state: "paused"`.
   - Malformed `--inputs` or `--scenario` files MUST exit with code `2` and print to `stderr`.
   - Full Night headless run (21,600 ticks) MUST complete in `<= 30s`.
   - Creative visual/audio additions live ONLY in `src/render/` and NEVER alter headless output.

## Verification Gate
- Never declare a phase or change complete until `npm run verify` passes (typecheck + build + unit/regression tests + Phase 2 headless scenarios + 21,600-tick perf benchmark + determinism check).
- Keep commits small, clear, and focused. Update `docs/notes/phase-N.md` when specs or assumptions change.
