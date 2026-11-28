/**
 * Seeded pseudo-random number generator (sfc32). Uses only 32-bit integer operations, so the
 * sequence is identical in every JS engine. Never use Math.random in simulation code.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    this.a = 0x9e3779b9;
    this.b = 0x243f6a88;
    this.c = 0xb7e15162;
    this.d = seed >>> 0;
    for (let i = 0; i < 15; i++) this.nextU32();
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Approximately normal (Irwin–Hall with 12 samples), mean 0, std 1. */
  gaussian(): number {
    let s = 0;
    for (let i = 0; i < 12; i++) s += this.next();
    return s - 6;
  }

  /** Current internal state, so a sequence can be resumed (e.g. for replays). */
  state(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }

  /** A generator that carries on from a saved `state()`. */
  static fromState(s: readonly [number, number, number, number]): Rng {
    const r = new Rng(0);
    [r.a, r.b, r.c, r.d] = s;
    return r;
  }
}
