import type { PhysicsEvent } from '@cuesports/physics';

/**
 * Which sound each physics event makes, and how loud and high. Pure, so the mapping is tested
 * without a browser. Speeds are impact speeds in m/s; gains are 0–1.
 */

export type SoundKind = 'strike' | 'miscue' | 'click' | 'cushion' | 'jaw' | 'drop';

export interface SoundCue {
  kind: SoundKind;
  /** Simulation time of the event (s). */
  t: number;
  gain: number;
  /** Playback-rate multiplier (1 = the sound's own pitch). */
  pitch: number;
}

/** Below this impact speed a contact is silent (balls settling against each other). */
export const QUIET = 0.03;

/** Loudness from impact speed: roughly logarithmic, as hearing is, and capped. */
export function loudness(speed: number, full: number): number {
  if (speed <= QUIET) return 0;
  return Math.min(1, Math.log1p(speed / QUIET) / Math.log1p(full / QUIET));
}

/** The sound for one event, or null for events that make none. */
export function cueFor(e: PhysicsEvent): SoundCue | null {
  switch (e.type) {
    case 'strike':
      return {
        kind: e.miscue ? 'miscue' : 'strike',
        t: e.t,
        gain: 0.35 + 0.65 * loudness(e.speed, 8),
        pitch: 0.95 + Math.min(0.15, e.speed * 0.015),
      };
    case 'ball': {
      const gain = loudness(e.speed, 6);
      // Harder hits ring a touch higher (real balls barely change pitch; this is subtle).
      return gain ? { kind: 'click', t: e.t, gain, pitch: 0.96 + Math.min(0.08, e.speed * 0.02) } : null;
    }
    case 'cushion': {
      if (e.kind === 'pocket') return null;
      const gain = loudness(e.speed, 4);
      if (!gain) return null;
      return {
        kind: e.kind === 'jaw' ? 'jaw' : 'cushion',
        t: e.t,
        gain,
        pitch: 0.9 + Math.min(0.25, e.speed * 0.05),
      };
    }
    case 'pocket':
      return { kind: 'drop', t: e.t, gain: 0.8, pitch: 1 };
    default:
      return null;
  }
}

/** All the sounds of a shot, in time order. */
export function cuesFor(events: readonly PhysicsEvent[]): SoundCue[] {
  return events.flatMap((e) => cueFor(e) ?? []).sort((a, b) => a.t - b.t);
}

/** The sounds due as playback moves from `from` to `to` (seconds): from < t ≤ to. */
export function due(cues: readonly SoundCue[], from: number, to: number): SoundCue[] {
  return cues.filter((c) => c.t > from && c.t <= to);
}
