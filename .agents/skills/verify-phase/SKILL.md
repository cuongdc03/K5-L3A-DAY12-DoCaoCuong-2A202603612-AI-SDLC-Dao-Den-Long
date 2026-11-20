---
name: verify-phase
description: Run full build, typecheck, unit/regression tests, headless contract v1.1 scenarios across Nights 1-3, 21,600-tick performance benchmark, and determinism check, then archive real proof artifacts.
---

# Verify Phase Skill (Contract v1.1)

Use this skill before tagging any phase (`phase-2` .. `phase-4`) or after any change to `src/core/`, `src/headless/`, or `game.contract.json`.

## Steps
1. Run `npm run typecheck` to ensure zero TypeScript errors.
2. Run `npm run build` to compile `dist/headless.mjs` and `dist/web/`.
3. Run `npm run verify` which executes:
   - `vitest run` (unit tests + Phase 1 regression tests with standard tuning + Phase 2 Contract v1.1 tests + exit-code-2 validation tests)
   - Live headless scenarios for every Phase 2 feature: Dash, Fall/Respawn, Night 2 (Đảo Cau bridge & jump pads), Night 3 (Đảo Chuông 3 tiers, ramps, strong wind), Drifters (steal & pulse drop), Wind Charms, and Pause/Resume.
   - Performance benchmark: 21,600 ticks (full Night 3) completes well under `30s`.
   - Determinism check: runs identical `--seed`, `--night`, `--scenario`, and `--inputs` twice and asserts SHA-256 byte equality.
   - Writes real logs and JSONL outputs to `docs/proof/phase-2/`.
4. Inspect `docs/proof/phase-2/verify-summary.txt`. Do not edit outputs manually.
5. If any check fails, fix the root cause in code/tests and re-run from Step 1.
