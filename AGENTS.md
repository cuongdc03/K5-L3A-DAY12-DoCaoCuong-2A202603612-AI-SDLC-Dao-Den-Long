# AGENTS.md — Đảo Đèn Lồng (AI SDLC · Contract v1.3 · v1.0.0)

## Stack & Commands
- Stack: TypeScript + Vite + Three.js (3D UI) + Node.js (Headless CLI, Soak CLI, Local Leaderboard Server, Chrome WebGL Bench) + Vitest.
- Install & Build: `npm ci && npm run build`
- Typecheck: `npm run typecheck`
- Unit & Contract Tests: `npm test`
- Full Verification + Evidence: `npm run verify`
- Play GUI: `node scripts/run.mjs` (or `npm run start`)
- Export Leaderboard: `node scripts/run.mjs --export-leaderboard out.json`
- Headless CLI: `node dist/headless.mjs --seed <int> --night <1|2|3> --ticks <int> --out <file.jsonl>`
- Benchmark CLI: `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json`
- Soak CLI: `node --no-expose-wasm --jitless dist/soak.mjs --seed 7 --nights 10 --out soak.json`

## Architecture Rules
1. **Strict core/render separation:** `src/core/` MUST NOT import `three`, `window`, `document`, or browser APIs. All gameplay logic runs deterministically at 60Hz (`DT = 1/60`) in `src/core/`.
2. **Single source of truth for tuning:** `src/core/config.ts` imports `tuning` directly from `game.contract.json` (v1.3).
3. **Determinism & zero-alloc hot path:** Never use `Math.random()` or `Date.now()` in `src/core/`. Store lantern fuel in integer `1/60` units (`fuel60` in `0..6000`). Avoid per-tick array allocations in `GameSimulation.step()` to keep soak memory flat (`mem_end_mb <= 1.2 * mem_start_mb`).
4. **Benchmark isolation:** Creative visual/audio additions (drifting clouds, BGM/SFX) are disabled in `?bench=1` mode so benchmark runs strictly on the standard 200-shade + 100-mote Night 1 scene.
5. **Verification Gate:** Never declare a change or release complete until `npm run verify` passes (typecheck + build + unit/regression tests + soak test + leaderboard export + determinism check).
