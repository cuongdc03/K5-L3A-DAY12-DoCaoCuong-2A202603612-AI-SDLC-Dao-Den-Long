# AGENTS.md — Đảo Đèn Lồng (AI SDLC)

## Stack & Commands
- Stack: TypeScript + Vite + Three.js (3D UI) + Node.js (Headless CLI) + Vitest.
- Install & Build: `npm ci && npm run build`
- Typecheck: `npm run typecheck`
- Unit & Contract Tests: `npm test`
- Full Verification + Evidence: `npm run verify`
- Play GUI: `npm run start` (hoặc `npm run dev`)
- Headless CLI: `node dist/headless.mjs --seed <int> --night 1 --ticks <int> --out <file.jsonl>`

## Architecture Rules
1. **Strict core/render separation:** `src/core/` MUST NOT import `three`, `window`, `document`, or browser APIs. All gameplay logic runs deterministically at 60Hz (`DT = 1/60`) in `src/core/`.
2. **Single source of truth for tuning:** `src/core/config.ts` imports `tuning` directly from `game.contract.json`. Never hardcode diverging tuning numbers.
3. **Determinism:** Never use `Math.random()` or `Date.now()` in `src/core/`. Always use the seeded PRNG (`src/core/prng.ts`).
4. **Test Contract v1.0 invariants:**
   - XZ-plane distances (`hypot(dx, dz) <= r`); ground at `Y = 0`; player starts at `(0, 0, 0)`.
   - Snapshot tick `0` is post-scenario, pre-input; step `k` produces tick `k + 1` and logs events at `tick = k + 1`.
   - Malformed `--inputs` or `--scenario` files MUST exit with code `2` and print an error to `stderr`.
   - Creative visual/audio additions live ONLY in `src/render/` and NEVER alter headless output.

## Verification Gate
- Never declare a phase or change complete until `npm run verify` passes (typecheck + build + unit tests + headless scenarios + determinism byte-equality check).
- Keep commits small, clear, and focused. Update `docs/notes/phase-N.md` when assumptions or rules change.
