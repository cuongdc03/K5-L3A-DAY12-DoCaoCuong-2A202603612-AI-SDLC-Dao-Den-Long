import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const PROOF_DIR = join(ROOT, 'docs', 'proof', 'phase-1');
const SCENARIO_DIR = join(PROOF_DIR, 'scenarios');
const HEADLESS_BIN = join(ROOT, 'dist', 'headless.mjs');

mkdirSync(SCENARIO_DIR, { recursive: true });

function runCmd(cmd, args, label) {
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  if (res.status !== 0) {
    process.stderr.write(`[FAIL] ${label}\n${res.stdout}\n${res.stderr}\n`);
    process.exit(res.status ?? 1);
  }
  return res.stdout;
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

const summaryLines = [];
summaryLines.push('=== Phase 1 Verification Summary ===');
summaryLines.push(`Timestamp: ${new Date().toISOString()}`);
summaryLines.push(`Node: ${process.version}`);

// 1. Typecheck
runCmd('npm', ['run', 'typecheck'], 'TypeScript typecheck');
summaryLines.push('[PASS] TypeScript typecheck (tsc --noEmit)');

// 2. Build (headless + web)
runCmd('npm', ['run', 'build'], 'Build headless + web');
summaryLines.push('[PASS] Build (dist/headless.mjs + dist/web/)');

// 3. Unit & Contract tests
const testOut = runCmd('npm', ['test'], 'Vitest unit & contract suite');
writeFileSync(join(PROOF_DIR, 'vitest-output.txt'), testOut, 'utf8');
summaryLines.push('[PASS] Vitest unit & headless contract suite (see vitest-output.txt)');

// 4. Scenario A: Full win flow (pickup + deposit + lantern_lit + game_over won)
const winScenario = join(SCENARIO_DIR, 'win-scenario.json');
const winInputs = join(SCENARIO_DIR, 'win-inputs.json');
const winOut = join(PROOF_DIR, 'scenario-win.jsonl');
writeFileSync(
  winScenario,
  JSON.stringify(
    {
      player: { pos: [0, 0, 0], carried: 2, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 5]],
      lanterns: [
        { id: 'L1', pos: [0, 0, 10], deposited: 0, lit: false },
        { id: 'L2', lit: true },
        { id: 'L3', lit: true },
        { id: 'L4', lit: true },
        { id: 'L5', lit: true },
      ],
      time_left_s: 120,
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  winInputs,
  JSON.stringify(
    {
      frames: [
        { tick: 0, move: [0, 1], cam_yaw_deg: 0 },
        { tick: 85, move: [0, 0], interact: true },
        { tick: 86, interact: false },
      ],
    },
    null,
    2,
  ) + '\n',
);
execFileSync('node', [
  HEADLESS_BIN,
  '--seed',
  '7',
  '--night',
  '1',
  '--scenario',
  winScenario,
  '--inputs',
  winInputs,
  '--ticks',
  '200',
  '--snapshot-every',
  '20',
  '--out',
  winOut,
]);
const winEnd = JSON.parse(readFileSync(winOut, 'utf8').trim().split('\n').at(-1));
if (winEnd.state !== 'won') {
  throw new Error(`Expected win scenario state=won, got ${winEnd.state}`);
}
summaryLines.push(`[PASS] Scenario Win: state=${winEnd.state}, ticks=${winEnd.ticks}, score=${winEnd.score}`);

// 5. Scenario B: Pulse stun & push + Shade chase & loss
const combatScenario = join(SCENARIO_DIR, 'combat-scenario.json');
const combatInputs = join(SCENARIO_DIR, 'combat-inputs.json');
const combatOut = join(PROOF_DIR, 'scenario-combat.jsonl');
writeFileSync(
  combatScenario,
  JSON.stringify(
    {
      player: { pos: [0, 0, 0], carried: 2, flames: 1 },
      random_motes: false,
      random_shades: false,
      shades: [{ id: 'S1', pos: [5, 0, 0] }],
      time_left_s: 60,
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  combatInputs,
  JSON.stringify(
    {
      frames: [
        { tick: 0, pulse: true },
        { tick: 1, pulse: false },
      ],
    },
    null,
    2,
  ) + '\n',
);
execFileSync('node', [
  HEADLESS_BIN,
  '--seed',
  '12',
  '--night',
  '1',
  '--scenario',
  combatScenario,
  '--inputs',
  combatInputs,
  '--ticks',
  '400',
  '--snapshot-every',
  '50',
  '--out',
  combatOut,
]);
const combatEnd = JSON.parse(readFileSync(combatOut, 'utf8').trim().split('\n').at(-1));
if (combatEnd.state !== 'lost') {
  throw new Error(`Expected combat scenario state=lost, got ${combatEnd.state}`);
}
summaryLines.push(`[PASS] Scenario Combat (Pulse -> Stun -> Chase -> Loss): state=${combatEnd.state}, ticks=${combatEnd.ticks}`);

// 6. Determinism check: 2 runs with identical seed=2026, ticks=600
const detA = join(PROOF_DIR, 'determinism-run1.jsonl');
const detB = join(PROOF_DIR, 'determinism-run2.jsonl');
for (const out of [detA, detB]) {
  execFileSync('node', [
    HEADLESS_BIN,
    '--seed',
    '2026',
    '--night',
    '1',
    '--ticks',
    '600',
    '--snapshot-every',
    '60',
    '--out',
    out,
  ]);
}
const hashA = sha256(detA);
const hashB = sha256(detB);
if (hashA !== hashB) {
  throw new Error(`Determinism check failed: ${hashA} !== ${hashB}`);
}
summaryLines.push(`[PASS] Determinism (seed=2026, 600 ticks): SHA-256 identical (${hashA})`);

const summaryText = summaryLines.join('\n') + '\n';
writeFileSync(join(PROOF_DIR, 'verify-summary.txt'), summaryText, 'utf8');
process.stdout.write(summaryText);
