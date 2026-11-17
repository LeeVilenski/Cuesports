import type { BallState, ShotResult } from '@cuesports/physics';

/** Facts about a shot that rulesets judge from, taken from the physics event timeline. */
export interface ShotFacts {
  /** First object ball the cue ball touched, or null. */
  firstContact: string | null;
  firstContactT: number;
  /** A ball (cue or object) touched a cushion after the first contact. Jaws count as cushions. */
  railAfterContact: boolean;
  /** Object balls potted, in order. */
  potted: string[];
  /** Which pocket each potted object ball went into. */
  pocketOf: Map<string, string>;
  /** Object balls that left the table. */
  offTable: string[];
  cueScratch: boolean;
  /** Distinct object balls that touched a cushion (for the legal-break test). */
  objectBallsToRail: number;
}

export function shotFacts(result: ShotResult, cue = 'cue'): ShotFacts {
  let firstContact: string | null = null;
  let firstContactT = Infinity;
  let railAfterContact = false;
  const potted: string[] = [];
  const pocketOf = new Map<string, string>();
  const offTable: string[] = [];
  const toRail = new Set<string>();
  let cueScratch = false;
  for (const e of result.events) {
    switch (e.type) {
      case 'ball':
        if (firstContact === null && (e.a === cue || e.b === cue)) {
          firstContact = e.a === cue ? e.b : e.a;
          firstContactT = e.t;
        }
        break;
      case 'cushion':
        if (e.kind === 'pocket') break;
        if (e.t >= firstContactT) railAfterContact = true;
        if (e.ball !== cue) toRail.add(e.ball);
        break;
      case 'pocket':
        if (e.ball === cue) cueScratch = true;
        else {
          potted.push(e.ball);
          pocketOf.set(e.ball, e.pocket);
        }
        break;
      case 'off-table':
        if (e.ball === cue) cueScratch = true;
        else offTable.push(e.ball);
        break;
    }
  }
  return {
    firstContact,
    firstContactT,
    railAfterContact,
    potted,
    pocketOf,
    offTable,
    cueScratch,
    objectBallsToRail: toRail.size,
  };
}

/** Numbered object balls still on the table, lowest first. */
export function numberedOnTable(balls: readonly BallState[]): string[] {
  return balls
    .filter((b) => b.id !== 'cue' && b.state !== 'pocketed' && Number.isInteger(Number(b.id)))
    .map((b) => b.id)
    .sort((a, b) => Number(a) - Number(b));
}
