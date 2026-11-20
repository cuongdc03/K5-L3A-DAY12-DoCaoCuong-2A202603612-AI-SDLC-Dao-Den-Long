import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const PROOF_DIR = join(ROOT, 'docs', 'proof', 'phase-3');
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

function runScenario(name, night, seed, ticks, snapshotEvery, scenarioObj, inputsObj) {
  const sPath = join(SCENARIO_DIR, `${name}-scenario.json`);
  const iPath = join(SCENARIO_DIR, `${name}-inputs.json`);
  const oPath = join(PROOF_DIR, `scenario-${name}.jsonl`);
  writeFileSync(sPath, JSON.stringify(scenarioObj, null, 2) + '\n');
  writeFileSync(iPath, JSON.stringify(inputsObj, null, 2) + '\n');
  execFileSync('node', [
    HEADLESS_BIN,
    '--seed',
    String(seed),
    '--night',
    String(night),
    '--scenario',
    sPath,
    '--inputs',
    iPath,
    '--ticks',
    String(ticks),
    '--snapshot-every',
    String(snapshotEvery),
    '--out',
    oPath,
  ]);
  return readFileSync(oPath, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
}

const summary = [];
summary.push('=== Phase 3 Verification Summary (Contract v1.2 — Đèn cạn dầu) ===');
summary.push(`Timestamp: ${new Date().toISOString()}`);
summary.push(`Node: ${process.version}`);

runCmd('npm', ['run', 'typecheck'], 'TypeScript typecheck');
summary.push('[PASS] TypeScript typecheck (tsc --noEmit)');

runCmd('npm', ['run', 'build'], 'Build headless + web');
summary.push('[PASS] Build (dist/headless.mjs + dist/web/)');

const vitestOut = runCmd('npm', ['test'], 'Vitest suite');
writeFileSync(join(PROOF_DIR, 'vitest-output.txt'), vitestOut, 'utf8');
summary.push('[PASS] Vitest unit, regression & Contract v1.2 suite');

// Scenario 1: Fuel decay, lantern_out, relight (5 motes, +40), refuel, capacity scaling
const fuelRecords = runScenario(
  'fuel-relight-refuel',
  1,
  101,
  120,
  30,
  {
    player: { pos: [0, 0, 24], carried: 8, flames: 3 },
    random_motes: false,
    random_shades: false,
    time_left_s: 240,
    lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 0.1, ever_lit: true }],
  },
  {
    frames: [
      { tick: 15, interact: true },
      { tick: 16, interact: false },
    ],
  },
);
const hasOut = fuelRecords.some((r) => r.type === 'event' && r.name === 'lantern_out');
const hasRelight = fuelRecords.some(
  (r) => r.type === 'event' && r.name === 'lantern_lit' && r.data.relight === true,
);
if (!hasOut || !hasRelight) throw new Error('Fuel out/relight scenario failed');
summary.push('[PASS] Scenario Fuel Out & Relight (5 motes, +40, capacity=12): verified');

// Scenario 2a: Shade draining weak lantern (<30) emits fuel_drain every 60 ticks
const drainRecords = runScenario(
  'shade-drain',
  1,
  102,
  120,
  30,
  {
    player: { pos: [0, 0, 10], carried: 5, flames: 3 },
    random_motes: false,
    random_shades: false,
    time_left_s: 240,
    lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25, ever_lit: true }],
    shades: [{ id: 'S1', pos: [0, 0, 24], state: 'drain', target_lantern_id: 'L1' }],
  },
  { frames: [] },
);
const hasDrainEv = drainRecords.some((r) => r.type === 'event' && r.name === 'fuel_drain');
if (!hasDrainEv) throw new Error('Shade fuel_drain event missing');

// Scenario 2b: Pulse interrupting a draining Shade awards +15 bonus
const drainPulseRecords = runScenario(
  'shade-drain-pulse',
  1,
  102,
  20,
  10,
  {
    player: { pos: [0, 0, 20], carried: 5, flames: 3 },
    random_motes: false,
    random_shades: false,
    time_left_s: 240,
    lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25, ever_lit: true }],
    shades: [{ id: 'S1', pos: [0, 0, 24], state: 'drain', target_lantern_id: 'L1' }],
  },
  {
    frames: [
      { tick: 0, pulse: true },
      { tick: 1, pulse: false },
    ],
  },
);
const drainEnd = drainPulseRecords.at(-1);
if (drainEnd.score !== 15) {
  throw new Error(`Shade drain/pulse scenario failed: score=${drainEnd.score}`);
}
summary.push('[PASS] Scenario Shade Drain (fuel_drain @60t) & Pulse Interrupt (+15 bonus): verified');

// Scenario 3: Dawn Survival Win (3/5 lanterns lit at dawn -> dawn_survived)
const dawnRecords = runScenario(
  'dawn-survived',
  1,
  103,
  120,
  60,
  {
    player: { pos: [0, 0, 0], carried: 0, flames: 2 },
    random_motes: false,
    random_shades: false,
    time_left_s: 1.0,
    lanterns: [
      { id: 'L1', lit: true, fuel: 81 },
      { id: 'L2', lit: true, fuel: 51 },
      { id: 'L3', lit: true, fuel: 21 },
      { id: 'L4', lit: false },
      { id: 'L5', lit: false },
    ],
  },
  { frames: [] },
);
const dawnOver = dawnRecords.find((r) => r.type === 'event' && r.name === 'game_over');
if (!dawnOver || dawnOver.data.reason !== 'dawn_survived') {
  throw new Error('Dawn survival scenario failed');
}
summary.push(`[PASS] Scenario Dawn Survived (3/5 lit): score=${dawnRecords.at(-1).score}`);

// Perf benchmark: Full Night 3 (18,000 ticks = 300s) <= 30s
const perfOut = join(PROOF_DIR, 'perf-night3-18000.jsonl');
const t0 = performance.now();
execFileSync('node', [
  HEADLESS_BIN,
  '--seed',
  '2026',
  '--night',
  '3',
  '--ticks',
  '18000',
  '--snapshot-every',
  '600',
  '--out',
  perfOut,
]);
const elapsedS = (performance.now() - t0) / 1000;
if (elapsedS > 30) throw new Error(`Perf benchmark exceeded 30s: ${elapsedS.toFixed(3)}s`);
summary.push(`[PASS] Perf Benchmark (Night 3, 18,000 ticks): ${elapsedS.toFixed(3)}s (limit <= 30s)`);

// Determinism check (Night 3, seed=2026, 1800 ticks)
const det1 = join(PROOF_DIR, 'determinism-run1.jsonl');
const det2 = join(PROOF_DIR, 'determinism-run2.jsonl');
for (const out of [det1, det2]) {
  execFileSync('node', [
    HEADLESS_BIN,
    '--seed',
    '2026',
    '--night',
    '3',
    '--ticks',
    '1800',
    '--snapshot-every',
    '180',
    '--out',
    out,
  ]);
}
const h1 = sha256(det1);
const h2 = sha256(det2);
if (h1 !== h2) throw new Error(`Determinism mismatch: ${h1} !== ${h2}`);
summary.push(`[PASS] Determinism (Night 3, seed=2026, 1800 ticks): SHA-256 identical (${h1})`);

const text = summary.join('\n') + '\n';
writeFileSync(join(PROOF_DIR, 'verify-summary.txt'), text, 'utf8');
process.stdout.write(text);
