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
    aimSigma: 1.6,
    powerSigma: 0.18,
    tipSigma: 0.08,
    position: 0,
    robustness: 0,
    sloppiness: 0.5,
    safeties: false,
  },
  {
    level: 2,
    name: 'Amateur',
    aimSigma: 0.8,
    powerSigma: 0.12,
    tipSigma: 0.05,
    position: 0.3,
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
    position: 0.7,
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
    position: 1,
    robustness: 3,
    sloppiness: 0.03,
    safeties: true,
  },
  {
    level: 5,
    name: 'Pro',
    aimSigma: 0.1,
    powerSigma: 0.03,
    tipSigma: 0.012,
    position: 1.2,
    robustness: 4,
    sloppiness: 0,
    safeties: true,
  },
];

export const skill = (level: number): SkillProfile =>
  SKILLS[Math.min(SKILLS.length, Math.max(1, level)) - 1]!;
