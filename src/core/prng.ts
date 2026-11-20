/**
 * Deterministic 32-bit PRNG (Mulberry32).
 * Produces identical sequences across Node.js and browsers for any integer seed.
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns a random point in an annulus [minR, maxR] on XZ plane. */
  pointInAnnulus(minR: number, maxR: number): [number, number] {
    const angle = this.next() * Math.PI * 2;
    const u = this.next();
    const r = Math.sqrt(minR * minR + u * (maxR * maxR - minR * minR));
    return [Math.cos(angle) * r, Math.sin(angle) * r];
  }
}
