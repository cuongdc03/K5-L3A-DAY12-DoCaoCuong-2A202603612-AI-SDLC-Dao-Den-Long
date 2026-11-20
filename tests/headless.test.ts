import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd());
const HEADLESS_BIN = join(ROOT, 'dist', 'headless.mjs');

describe('Headless CLI — Test Contract v1.1 (Nights 1, 2, 3)', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'dao-den-long-v11-'));
    if (!existsSync(HEADLESS_BIN)) {
      const build = spawnSync('npm', ['run', 'build:headless'], { cwd: ROOT, encoding: 'utf8' });
      if (build.status !== 0) {
        throw new Error(`Failed to build headless CLI: ${build.stderr}`);
      }
    }
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('produces identical byte-for-byte JSONL across two runs on Night 3', () => {
    const out1 = join(workDir, 'det1.jsonl');
    const out2 = join(workDir, 'det2.jsonl');

    const r1 = spawnSync(
      'node',
      [HEADLESS_BIN, '--seed', '42', '--night', '3', '--ticks', '600', '--out', out1],
      { encoding: 'utf8' },
    );
    const r2 = spawnSync(
      'node',
      [HEADLESS_BIN, '--seed', '42', '--night', '3', '--ticks', '600', '--out', out2],
      { encoding: 'utf8' },
    );

    expect(r1.status).toBe(0);
    expect(r2.status).toBe(0);
    expect(readFileSync(out1, 'utf8')).toBe(readFileSync(out2, 'utf8'));

    const lines = readFileSync(out1, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines[0].type).toBe('snapshot');
    expect(lines[0].night).toBe(3);
    expect(lines[0].wind).toBeDefined();
    expect(lines[0].player.vel).toBeDefined();
    expect(lines[0].drifters).toBeDefined();
    expect(lines[0].charms).toBeDefined();
  });

  it('completes a full Night 3 headless run (21,600 ticks) well under 30 seconds', () => {
    const outPath = join(workDir, 'perf-21600.jsonl');
    const t0 = performance.now();
    const res = spawnSync(
      'node',
      [
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
        outPath,
      ],
      { encoding: 'utf8' },
    );
    const elapsedSec = (performance.now() - t0) / 1000;
    expect(res.status).toBe(0);
    expect(elapsedSec).toBeLessThan(30);
  });

  it('exits with code 2 and writes to stderr on malformed inputs file', () => {
    const badInputs = join(workDir, 'bad-inputs.json');
    const outPath = join(workDir, 'bad.jsonl');

    writeFileSync(
      badInputs,
      JSON.stringify({
        frames: [
          { tick: 5, pause: true },
          { tick: 3, pause: false },
        ],
      }),
    );

    const res = spawnSync(
      'node',
      [
        HEADLESS_BIN,
        '--seed',
        '1',
        '--night',
        '2',
        '--inputs',
        badInputs,
        '--ticks',
        '10',
        '--out',
        outPath,
      ],
      { encoding: 'utf8' },
    );

    expect(res.status).toBe(2);
    expect(res.stderr.length).toBeGreaterThan(0);
  });
});
