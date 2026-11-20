---
name: verify-phase
description: Run full build, typecheck, unit tests, headless contract scenarios, and determinism check, then archive real proof artifacts for the current phase.
---

# Verify Phase Skill

Use this skill before tagging any phase (`phase-1` .. `phase-4`) or after any change to `src/core/` or `game.contract.json`.

## Steps
1. Run `npm run typecheck` to ensure zero TypeScript errors.
2. Run `npm run build` to compile `dist/headless.mjs` and `dist/web/`.
3. Run `npm run verify` which executes:
   - `vitest run` (unit tests + headless contract tests + exit-code-2 validation tests)
   - Live headless scenario runs against `node dist/headless.mjs`
   - Determinism check: runs the exact same `--seed`, `--scenario`, and `--inputs` twice and asserts SHA-256 byte equality of both JSONL outputs.
   - Writes real logs and JSONL outputs to `docs/proof/phase-1/`.
4. Inspect the generated proof summary in `docs/proof/phase-1/verify-summary.txt`. Do not edit outputs manually.
5. If any check fails, fix the root cause in code/tests and re-run from Step 1.
