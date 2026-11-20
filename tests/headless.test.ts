import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd());
const HEADLESS_BIN = join(ROOT, 'dist', 'headless.mjs');

describe('Headless CLI — Test Contract v1.0', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'dao-den-long-test-'));
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

  it('produces identical byte-for-byte JSONL across two runs with same seed', () => {
    const out1 = join(workDir, 'det1.jsonl');
    const out2 = join(workDir, 'det2.jsonl');

    const r1 = spawnSync(
      'node',
      [HEADLESS_BIN, '--seed', '42', '--night', '1', '--ticks', '300', '--out', out1],
      { encoding: 'utf8' },
    );
    const r2 = spawnSync(
      'node',
      [HEADLESS_BIN, '--seed', '42', '--night', '1', '--ticks', '300', '--out', out2],
      { encoding: 'utf8' },
    );

    expect(r1.status).toBe(0);
    expect(r2.status).toBe(0);

    const content1 = readFileSync(out1, 'utf8');
    const content2 = readFileSync(out2, 'utf8');
    expect(content1).toBe(content2);

    const lines = content1.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines[0].type).toBe('snapshot');
    expect(lines[0].tick).toBe(0);
    expect(lines[lines.length - 1].type).toBe('end');
    expect(lines[lines.length - 1].ticks).toBeLessThanOrEqual(300);
  });

  it('runs a full pickup -> deposit -> win scenario via CLI', () => {
    const scenarioPath = join(workDir, 'win-scenario.json');
    const inputsPath = join(workDir, 'win-inputs.json');
    const outPath = join(workDir, 'win.jsonl');

    writeFileSync(
      scenarioPath,
      JSON.stringify({
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
      }),
    );

    // Move +Z at 7 m/s -> reaches z=10 around tick 86, interact at tick 90
    writeFileSync(
      inputsPath,
      JSON.stringify({
        frames: [
          { tick: 0, move: [0, 1], cam_yaw_deg: 0 },
          { tick: 85, move: [0, 0], interact: true },
          { tick: 86, interact: false },
        ],
      }),
    );

    const res = spawnSync(
      'node',
      [
        HEADLESS_BIN,
        '--seed',
        '7',
        '--night',
        '1',
        '--scenario',
        scenarioPath,
        '--inputs',
        inputsPath,
        '--ticks',
        '200',
        '--snapshot-every',
        '20',
        '--out',
        outPath,
      ],
      { encoding: 'utf8' },
    );

    expect(res.status).toBe(0);
    const records = readFileSync(outPath, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));

    const eventNames = records.filter((r) => r.type === 'event').map((r) => r.name);
    expect(eventNames).toEqual(['mote_picked', 'deposit', 'lantern_lit', 'game_over']);
    const end = records[records.length - 1];
    expect(end.type).toBe('end');
    expect(end.state).toBe('won');
  });

  it('exits with code 2 and writes to stderr on malformed inputs file', () => {
    const badInputs = join(workDir, 'bad-inputs.json');
    const outPath = join(workDir, 'bad.jsonl');

    writeFileSync(
      badInputs,
      JSON.stringify({
        frames: [
          { tick: 5, move: [0, 1] },
          { tick: 3, move: [0, 0] },
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
        '1',
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
