import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const PROOF_DIR = join(ROOT, 'docs', 'proof', 'phase-4');
const HEADLESS_BIN = join(ROOT, 'dist', 'headless.mjs');
const SOAK_BIN = join(ROOT, 'dist', 'soak.mjs');

mkdirSync(PROOF_DIR, { recursive: true });

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

const summary = [];
summary.push('=== Phase 4 Verification Summary (Contract v1.3 · v1.0.0) ===');
summary.push(`Timestamp: ${new Date().toISOString()}`);
summary.push(`Node: ${process.version}`);

runCmd('npm', ['run', 'typecheck'], 'TypeScript typecheck');
summary.push('[PASS] TypeScript typecheck (tsc --noEmit)');

runCmd('npm', ['run', 'build'], 'Build headless + soak + web');
summary.push('[PASS] Build (dist/headless.mjs + dist/soak.mjs + dist/web/)');

const vitestOut = runCmd('npm', ['test'], 'Vitest suite');
writeFileSync(join(PROOF_DIR, 'vitest-output.txt'), vitestOut, 'utf8');
summary.push('[PASS] Vitest unit, regression & Contract v1.0-v1.3 suite');

// Soak test (10 nights)
const soakProof = join(PROOF_DIR, 'soak-verify.json');
execFileSync('node', [
  '--no-expose-wasm',
  '--jitless',
  SOAK_BIN,
  '--seed',
  '7',
  '--nights',
  '10',
  '--out',
  soakProof,
]);
const soakData = JSON.parse(readFileSync(soakProof, 'utf8'));
if (soakData.crashes !== 0 || soakData.mem_end_mb > 1.2 * soakData.mem_start_mb) {
  throw new Error(
    `Soak threshold failed: crashes=${soakData.crashes}, mem=${soakData.mem_start_mb}->${soakData.mem_end_mb}`,
  );
}
summary.push(
  `[PASS] Soak Test (10 nights): crashes=0, mem=${soakData.mem_start_mb}->${soakData.mem_end_mb}MB (${(
    soakData.mem_end_mb / soakData.mem_start_mb
  ).toFixed(2)}x <= 1.2x), duration=${soakData.duration_s}s`,
);

// Leaderboard export CLI check
const lbExportPath = join(PROOF_DIR, 'leaderboard-export.json');
execFileSync('node', [join(ROOT, 'scripts', 'run.mjs'), '--export-leaderboard', lbExportPath]);
const lbData = JSON.parse(readFileSync(lbExportPath, 'utf8'));
if (!Array.isArray(lbData.entries)) {
  throw new Error('Leaderboard export missing entries array');
}
summary.push(`[PASS] Leaderboard CLI export: valid JSON with ${lbData.entries.length} entries`);

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

// Check bench.json presence if already generated
const benchPath = join(ROOT, 'bench.json');
if (existsSync(benchPath)) {
  const b = JSON.parse(readFileSync(benchPath, 'utf8'));
  summary.push(
    `[INFO] bench.json present: avg_fps=${b.avg_fps}, p1_low_fps=${b.p1_low_fps}, frame_ms_p95=${b.frame_ms_p95}, load_ms=${b.load_ms}`,
  );
}

const text = summary.join('\n') + '\n';
writeFileSync(join(PROOF_DIR, 'verify-summary.txt'), text, 'utf8');
process.stdout.write(text);
