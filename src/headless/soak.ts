import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { TICK_RATE } from '../core/config';
import { SeededRNG } from '../core/prng';
import { createDefaultInputState, GameSimulation } from '../core/simulation';
import type { NightId } from '../core/types';

interface SoakArgs {
  seed: number;
  nights: number;
  out: string;
}

function parseIntArg(name: string, raw: string | undefined): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) {
    throw new Error(`Invalid or missing integer argument for ${name}: "${raw ?? ''}"`);
  }
  return Number.parseInt(raw, 10);
}

function parseArgs(argv: string[]): SoakArgs {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected arg: ${token}`);
    const eq = token.indexOf('=');
    if (eq !== -1) {
      map.set(token.slice(0, eq), token.slice(eq + 1));
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`Missing value for ${token}`);
      map.set(token, next);
      i++;
    }
  }
  const seed = parseIntArg('--seed', map.get('--seed') ?? '7');
  const nights = parseIntArg('--nights', map.get('--nights') ?? '10');
  const out = map.get('--out');
  if (!out) throw new Error('Missing required argument --out <file.json>');
  if (nights < 1) throw new Error(`--nights must be >= 1 (got ${nights})`);
  return { seed, nights, out };
}

function rssMb(): number {
  return Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));
    const t0 = performance.now();

    const results: Array<'won' | 'lost'> = [];
    let crashes = 0;
    let memStartMb = 0;

    for (let i = 0; i < args.nights; i++) {
      const nightId = ((i % 3) + 1) as NightId;
      const nightSeed = args.seed + i;
      let sim: GameSimulation | null = new GameSimulation({ seed: nightSeed, night: nightId });

      if (i === 0) {
        memStartMb = rssMb();
      }

      const inputRng = new SeededRNG((nightSeed * 2654435761) ^ 0x55aa55aa);
      const maxTicks = Math.ceil(sim.initialTimeLeftS * TICK_RATE) + 5;
      const input = createDefaultInputState();

      try {
        for (let t = 0; t < maxTicks; t++) {
          if (sim.state === 'won' || sim.state === 'lost') break;

          // Every 30 ticks pick a new random movement direction
          if (t % 30 === 0) {
            const angle = inputRng.next() * Math.PI * 2;
            input.move = [Math.cos(angle), Math.sin(angle)];
          }

          // Per-tick probabilities: 5% jump, 3% dash, 2% pulse, 10% interact
          // Only trigger rising edge if previous tick was false (simple toggle pulse)
          input.jump = !input.jump && inputRng.next() < 0.05;
          input.dash = !input.dash && inputRng.next() < 0.03;
          input.pulse = !input.pulse && inputRng.next() < 0.02;
          input.interact = !input.interact && inputRng.next() < 0.1;

          sim.step(input);
        }

        results.push(sim.state === 'won' ? 'won' : 'lost');
      } catch (err) {
        crashes += 1;
        results.push('lost');
        process.stderr.write(`Crash on night ${i} (Night ${nightId}, seed ${nightSeed}): ${(err as Error).message}\n`);
      } finally {
        // Explicit release between nights
        sim = null;
      }
    }

    const memEndMb = rssMb();
    const durationS = Math.round(((performance.now() - t0) / 1000) * 100) / 100;

    const output = {
      nights: args.nights,
      crashes,
      results,
      mem_start_mb: memStartMb,
      mem_end_mb: memEndMb,
      duration_s: durationS,
    };

    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, JSON.stringify(output, null, 2) + '\n', 'utf8');
    process.exit(crashes === 0 ? 0 : 1);
  } catch (err) {
    process.stderr.write(`Soak Error: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

main();
