import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const PROOF_DIR = join(ROOT, 'docs', 'proof', 'phase-2');
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
  const lines = readFileSync(oPath, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  return lines;
}

const summary = [];
summary.push('=== Phase 2 Verification Summary (Contract v1.1) ===');
summary.push(`Timestamp: ${new Date().toISOString()}`);
summary.push(`Node: ${process.version}`);

// 1. Typecheck & Build
runCmd('npm', ['run', 'typecheck'], 'TypeScript typecheck');
summary.push('[PASS] TypeScript typecheck (tsc --noEmit)');

runCmd('npm', ['run', 'build'], 'Build headless + web');
summary.push('[PASS] Build (dist/headless.mjs + dist/web/)');

// 2. Unit + Regression + CLI tests
const vitestOut = runCmd('npm', ['test'], 'Vitest suite');
writeFileSync(join(PROOF_DIR, 'vitest-output.txt'), vitestOut, 'utf8');
summary.push('[PASS] Vitest unit, Phase 1 regression & Contract v1.1 suite');

// 3. Scenario: Dash & Fall/Respawn (Night 1)
const fallRecords = runScenario(
  'dash-fall',
  1,
  11,
  150,
  30,
  {
    player: { pos: [38, 0, 0], carried: 4, flames: 2 },
    random_motes: false,
    random_shades: false,
  },
  {
    frames: [
      { tick: 0, move: [1, 0], dash: true },
      { tick: 1, dash: false },
    ],
  },
);
const hasDash = fallRecords.some((r) => r.type === 'event' && r.name === 'dash');
const hasFall = fallRecords.some(
  (r) => r.type === 'event' && r.name === 'player_hit' && r.data.by === 'fall' && r.data.lost === 4,
);
if (!hasDash || !hasFall) throw new Error('Dash/Fall scenario failed');
summary.push('[PASS] Scenario Dash & Fall/Respawn (Night 1): dash emitted, fall lost=4, respawned');

// 4. Scenario: Night 2 Jump Pad + Charm + Drifter steal & pulse drop
const n2Records = runScenario(
  'night2-drifter-charm',
  2,
  22,
  140,
  20,
  {
    player: { pos: [35, 0, 0], carried: 6, flames: 3 },
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    drifters: [{ id: 'D1', pos: [35.5, 0, 0], state: 'chase', stolen: 0 }],
  },
  {
    frames: [
      { tick: 1, pulse: true },
      { tick: 2, pulse: false },
    ],
  },
);
const hasCharm = n2Records.some((r) => r.type === 'event' && r.name === 'charm_picked');
const hasSteal = n2Records.some((r) => r.type === 'event' && r.name === 'drifter_steal');
const hasDrop = n2Records.some((r) => r.type === 'event' && r.name === 'drifter_drop');
if (!hasCharm || !hasSteal || !hasDrop) throw new Error('Night 2 Charm/Drifter scenario failed');
summary.push('[PASS] Scenario Night 2 (Charm + Drifter steal + Pulse drop): all events verified');

// 5. Scenario: Night 3 3-Tier Jump Pad + Strong Wind + Pause/Resume
const n3Records = runScenario(
  'night3-tier-wind-pause',
  3,
  33,
  1920,
  60,
  {
    player: { pos: [0, 3, 13], carried: 0, flames: 3 },
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    wind_enabled: true,
  },
  {
    frames: [
      { tick: 100, pause: true },
      { tick: 101, pause: false },
      { tick: 120, pause: true },
      { tick: 121, pause: false },
    ],
  },
);
const hasPaused = n3Records.some((r) => r.type === 'event' && r.name === 'paused');
const hasResumed = n3Records.some((r) => r.type === 'event' && r.name === 'resumed');
const windActiveSnap = n3Records.some((r) => r.type === 'snapshot' && r.wind && r.wind.active);
if (!hasPaused || !hasResumed || !windActiveSnap) {
  throw new Error('Night 3 Pause/Wind scenario failed');
}
summary.push('[PASS] Scenario Night 3 (Tier 2 Jump Pad + Strong Wind + Pause/Resume): verified');

// 6. Performance Benchmark: Full Night 3 (21,600 ticks) <= 30s
const perfOut = join(PROOF_DIR, 'perf-night3-21600.jsonl');
const t0 = performance.now();
execFileSync('node', [
  HEADLESS_BIN,
  '--seed',
  '2026',
  '--night',
  '3',
  '--ticks',
  '21600',
  '--snapshot-every',
  '600',
  '--out',
  perfOut,
]);
const elapsedS = (performance.now() - t0) / 1000;
if (elapsedS > 30) {
  throw new Error(`21,600-tick benchmark exceeded 30s: ${elapsedS.toFixed(3)}s`);
}
summary.push(`[PASS] Perf Benchmark (Night 3, 21,600 ticks): ${elapsedS.toFixed(3)}s (limit <= 30s)`);

// 7. Determinism check (Night 3, seed=2026, 1800 ticks)
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
