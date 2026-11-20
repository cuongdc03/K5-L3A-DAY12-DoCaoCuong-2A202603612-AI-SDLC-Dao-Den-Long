import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { runHeadlessSimulation } from '../core/simulation';
import type { InputFrame, ScenarioFile } from '../core/types';
import {
  ContractFormatError,
  validateInputsFile,
  validateScenarioFile,
} from '../core/validation';

interface CliArgs {
  seed: number;
  night: number;
  ticks: number;
  out: string;
  snapshotEvery: number;
  scenarioPath?: string;
  inputsPath?: string;
}

function parseIntArg(name: string, raw: string | undefined): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) {
    throw new Error(`Invalid or missing integer argument for ${name}: "${raw ?? ''}"`);
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`Out-of-range integer for ${name}: "${raw}"`);
  }
  return n;
}

function parseCliArgs(argv: string[]): CliArgs {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected positional argument: "${token}"`);
    }
    const eqIdx = token.indexOf('=');
    if (eqIdx !== -1) {
      map.set(token.slice(0, eqIdx), token.slice(eqIdx + 1));
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`Missing value for option ${token}`);
      }
      map.set(token, next);
      i++;
    }
  }

  const seed = parseIntArg('--seed', map.get('--seed'));
  const night = parseIntArg('--night', map.get('--night'));
  if (night !== 1) {
    throw new Error(`Unsupported --night value: ${night} (Phase 1 supports --night 1 only)`);
  }

  const ticks = parseIntArg('--ticks', map.get('--ticks'));
  if (ticks < 0) {
    throw new Error(`--ticks must be >= 0 (got ${ticks})`);
  }

  const out = map.get('--out');
  if (!out) {
    throw new Error('Missing required argument --out <file.jsonl>');
  }

  const snapshotRaw = map.get('--snapshot-every');
  const snapshotEvery = snapshotRaw !== undefined ? parseIntArg('--snapshot-every', snapshotRaw) : 10;
  if (snapshotEvery < 1) {
    throw new Error(`--snapshot-every must be >= 1 (got ${snapshotEvery})`);
  }

  return {
    seed,
    night,
    ticks,
    out,
    snapshotEvery,
    scenarioPath: map.get('--scenario'),
    inputsPath: map.get('--inputs'),
  };
}

function readJsonOrFormatError(filePath: string, label: string): unknown {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read ${label} file "${filePath}": ${(err as Error).message}`);
  }
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new ContractFormatError(
      `Malformed JSON in ${label} file "${filePath}": ${(err as Error).message}`,
    );
  }
}

function main(): void {
  try {
    const args = parseCliArgs(process.argv.slice(2));

    let scenario: ScenarioFile | undefined;
    if (args.scenarioPath) {
      const rawScenario = readJsonOrFormatError(args.scenarioPath, 'scenario');
      scenario = validateScenarioFile(rawScenario);
    }

    let frames: InputFrame[] | undefined;
    if (args.inputsPath) {
      const rawInputs = readJsonOrFormatError(args.inputsPath, 'inputs');
      const validated = validateInputsFile(rawInputs);
      frames = validated.frames;
    }

    const records = runHeadlessSimulation({
      seed: args.seed,
      night: args.night,
      ticks: args.ticks,
      snapshotEvery: args.snapshotEvery,
      scenario,
      frames,
    });

    mkdirSync(dirname(args.out), { recursive: true });
    const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
    writeFileSync(args.out, lines, 'utf8');
    process.exit(0);
  } catch (err) {
    if (err instanceof ContractFormatError) {
      process.stderr.write(`Format Error: ${err.message}\n`);
      process.exit(2);
    }
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

main();
