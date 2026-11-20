/** How well an AI player plays. Errors are standard deviations applied when the shot is taken. */
export interface SkillProfile {
  level: number;
  name: string;
  /** Aim error, degrees. */
  aimSigma: number;
  /** Cue speed error, as a fraction of the speed. */
  powerSigma: number;
  /** Tip offset error, fractions of the ball radius. */
  tipSigma: number;
  /** Weight given to where the cue ball ends up (0 = only cares about potting). */
  position: number;
  /** Noisy re-simulations of the best candidates, to prefer shots that still work with errors. */
  robustness: number;
  /** Chance of picking one of the next-best shots instead of the best (makes weak players weaker). */
  sloppiness: number;
  /** Whether it considers safety shots at all. */
  safeties: boolean;
}

export const SKILLS: readonly SkillProfile[] = [
  {
    level: 1,
    name: 'Beginner',
    aimSigma: 1.0,
    powerSigma: 0.14,
    tipSigma: 0.08,
    position: 0,
    robustness: 0,
    sloppiness: 0.5,
    safeties: false,
  },
  {
    level: 2,
    name: 'Amateur',
    aimSigma: 0.6,
    powerSigma: 0.1,
    tipSigma: 0.05,
    position: 0.5,
    robustness: 0,
    sloppiness: 0.25,
    safeties: false,
  },
  {
    level: 3,
    name: 'Club',
    aimSigma: 0.4,
    powerSigma: 0.08,
    tipSigma: 0.03,
    position: 1.2,
    robustness: 2,
    sloppiness: 0.1,
    safeties: true,
  },
  {
    level: 4,
    name: 'Semi-pro',
    aimSigma: 0.2,
    powerSigma: 0.05,
    tipSigma: 0.02,
    position: 2,
    robustness: 4,
    sloppiness: 0.03,
    safeties: true,
  },
  {
    level: 5,
    name: 'Pro',
    aimSigma: 0.1,
    powerSigma: 0.03,
    tipSigma: 0.012,
    position: 2.8,
    robustness: 6,
    sloppiness: 0,
    safeties: true,
  },
];

/**
 * The profile for a level. In-between levels (2.5) blend the two either side, so a career can
 * make each opponent a little stronger than the last. Safeties start at 2.5.
 */
export function skill(level: number): SkillProfile {
  const l = Math.min(SKILLS.length, Math.max(1, level));
  const lo = SKILLS[Math.floor(l) - 1]!;
  const hi = SKILLS[Math.ceil(l) - 1]!;
  if (lo === hi) return lo;
  const k = l - Math.floor(l);
  const mix = (a: number, b: number) => a + (b - a) * k;
  return {
    level: l,
    name: k < 0.5 ? lo.name : hi.name,
    aimSigma: mix(lo.aimSigma, hi.aimSigma),
    powerSigma: mix(lo.powerSigma, hi.powerSigma),
    tipSigma: mix(lo.tipSigma, hi.tipSigma),
    position: mix(lo.position, hi.position),
    robustness: Math.round(mix(lo.robustness, hi.robustness)),
    sloppiness: mix(lo.sloppiness, hi.sloppiness),
    safeties: l >= 2.5,
  };
}
