import type { SoundKind } from './cues';

/**
 * The sounds, made from scratch rather than recorded: decaying tones for the ring of the balls,
 * filtered noise for contact, low thumps for cushions and pockets. Each returns mono samples at
 * the given rate, peak at most 1. Seeded, so every click sounds the same.
 */

export type AmbienceKind = 'pub' | 'club' | 'hall' | 'arena';

function noise(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
}

/** Normalises to a peak of `peak`. */
function normalise(x: Float32Array, peak = 0.9): Float32Array {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] = (x[i]! / m) * peak;
  return x;
}

/** Adds a decaying sine (f Hz, decay time constant tau s) starting at t0 seconds. */
function ring(x: Float32Array, rate: number, f: number, tau: number, amp: number, t0 = 0): void {
  const start = Math.floor(t0 * rate);
  for (let i = start; i < x.length; i++) {
    const t = (i - start) / rate;
    x[i]! += amp * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / tau);
  }
}

/** Adds a burst of noise, low-passed by a one-pole filter (k: 0 = very muffled, 1 = bright). */
function burst(
  x: Float32Array,
  rate: number,
  tau: number,
  amp: number,
  k: number,
  seed: number,
  t0 = 0,
): void {
  const r = noise(seed);
  const start = Math.floor(t0 * rate);
  let y = 0;
  for (let i = start; i < x.length; i++) {
    const t = (i - start) / rate;
    y += k * (r() - y);
    x[i]! += amp * y * Math.exp(-t / tau);
  }
}

export function synth(kind: SoundKind, rate: number): Float32Array {
  const len = (s: number) => new Float32Array(Math.ceil(s * rate));
  switch (kind) {
    case 'click': {
      // Phenolic resin balls: a hard, bright, very short click with a high ring.
      const x = len(0.07);
      burst(x, rate, 0.0015, 0.8, 0.9, 1);
      ring(x, rate, 3150, 0.006, 0.6);
      ring(x, rate, 5300, 0.004, 0.35);
      return normalise(x);
    }
    case 'strike': {
      // Leather tip on the ball: a soft "tock".
      const x = len(0.09);
      burst(x, rate, 0.004, 0.7, 0.35, 2);
      ring(x, rate, 1250, 0.01, 0.5);
      ring(x, rate, 190, 0.02, 0.4);
      return normalise(x, 0.8);
    }
    case 'miscue': {
      // The tip skids off: a click and a scrape.
      const x = len(0.2);
      ring(x, rate, 1800, 0.008, 0.5);
      burst(x, rate, 0.06, 0.5, 0.6, 3, 0.005);
      return normalise(x, 0.75);
    }
    case 'cushion': {
      // Rubber under cloth: a dull thud.
      const x = len(0.14);
      ring(x, rate, 105, 0.04, 0.8);
      burst(x, rate, 0.012, 0.5, 0.12, 4);
      return normalise(x, 0.85);
    }
    case 'jaw': {
      // The pocket's knuckle: harder and higher than a cushion.
      const x = len(0.12);
      ring(x, rate, 230, 0.025, 0.7);
      burst(x, rate, 0.008, 0.5, 0.3, 5);
      return normalise(x, 0.85);
    }
    case 'drop': {
      // Into the pocket: a thump, then the ball rattling to rest among the others.
      const x = len(0.5);
      ring(x, rate, 85, 0.05, 0.9);
      burst(x, rate, 0.02, 0.4, 0.15, 6);
      const rattles = [0.07, 0.15, 0.22, 0.27];
      rattles.forEach((t, i) => {
        ring(x, rate, 2400 - i * 300, 0.004, 0.25 * (1 - i * 0.2), t);
        burst(x, rate, 0.002, 0.2, 0.7, 7 + i, t);
      });
      return normalise(x, 0.8);
    }
  }
}

/**
 * A few seconds of room tone to loop: low brown noise for a quiet room, with a murmur of voices
 * (noise that swells and fades) for the pub and a crowd for the arena.
 */
export function ambience(kind: AmbienceKind, rate: number): Float32Array {
  const seconds = 6;
  const x = new Float32Array(seconds * rate);
  const r = noise(11);
  let brown = 0;
  const crowd = kind === 'arena' ? 1 : kind === 'pub' ? 0.6 : kind === 'club' ? 0.25 : 0.1;
  let band = 0;
  let band2 = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / rate;
    brown = (brown + 0.02 * r()) * 0.995;
    // Voices: noise band-passed around speech frequencies, swelling slowly.
    band += 0.25 * (r() - band);
    band2 += 0.25 * (band - band2);
    const swell =
      0.6 + 0.4 * Math.sin((2 * Math.PI * t) / seconds) * Math.sin((2 * Math.PI * 3 * t) / seconds + 1);
    x[i] = brown * 3 + crowd * (band - band2) * 2.5 * swell;
  }
  // Fade the ends together so the loop doesn't click.
  const fade = Math.floor(0.05 * rate);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    const a = x[i]!;
    const b = x[x.length - fade + i]!;
    x[i] = a * k + b * (1 - k);
  }
  return normalise(x.subarray(0, x.length - fade).slice(), 0.5);
}
