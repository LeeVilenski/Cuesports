/**
 * The first-run lesson: a handful of steps, each finished by doing the thing it describes. Pure,
 * so the order and the rules are tested without a table.
 */

export type TutorialEvent =
  | { type: 'aim'; amount: number }
  | { type: 'shot' }
  | { type: 'settled'; potted: boolean }
  | { type: 'spin' }
  | { type: 'camera' };

export type StepId = 'aim' | 'shoot' | 'pot' | 'spin' | 'camera' | 'done';

export interface Step {
  id: StepId;
  title: string;
  text: string;
}

export const STEPS: Step[] = [
  { id: 'aim', title: 'Aim', text: 'Drag anywhere on the table to turn the cue. Slow drags are finer.' },
  {
    id: 'shoot',
    title: 'Shoot',
    text: 'Pull the power bar down, then let go. The further you pull, the harder the shot.',
  },
  {
    id: 'pot',
    title: 'Pot the 1',
    text: 'The 1 lines up with the corner. Aim at its middle and use about a third of the power.',
  },
  {
    id: 'spin',
    title: 'Spin',
    text: 'Tap the cue ball at the bottom right and pick a spot: low for screw-back, high for follow.',
  },
  { id: 'camera', title: 'Camera', text: 'Tap the camera button at the top to switch views. Pinch to zoom.' },
  {
    id: 'done',
    title: 'You’re ready',
    text: 'That’s the basics. Practise on a free table, or start a match from the home screen.',
  },
];

/** How far (radians) the aim has to turn before the first step counts. */
export const AIM_NEEDED = 0.08;

export interface TutorialState {
  step: number;
  aimed: number;
  /** Shots played at the pot step, for the hint after a miss. */
  tries: number;
}

export const newTutorial = (): TutorialState => ({ step: 0, aimed: 0, tries: 0 });

export const stepOf = (s: TutorialState): Step => STEPS[Math.min(s.step, STEPS.length - 1)]!;

export interface Advance {
  state: TutorialState;
  /** The step moved on. */
  next: boolean;
  /** Put the lesson's balls back (after a shot that didn't finish the pot step). */
  reset: boolean;
  /** A word for the player, if any. */
  say?: string;
}

export function advance(s: TutorialState, e: TutorialEvent): Advance {
  const id = stepOf(s).id;
  const go = (extra: Partial<Advance> = {}): Advance => ({
    state: { ...s, step: s.step + 1 },
    next: true,
    reset: false,
    ...extra,
  });
  const stay = (extra: Partial<Advance> = {}): Advance => ({ state: s, next: false, reset: false, ...extra });
  switch (id) {
    case 'aim':
      if (e.type !== 'aim') return stay();
      if (s.aimed + Math.abs(e.amount) >= AIM_NEEDED) return go();
      return stay({ state: { ...s, aimed: s.aimed + Math.abs(e.amount) } });
    case 'shoot':
      // Any shot will do; if it happened to pot the 1, that's the next step done too.
      if (e.type !== 'settled') return stay();
      return e.potted
        ? { state: { ...s, step: s.step + 2 }, next: true, reset: false, say: 'Potted it already!' }
        : go({ reset: true });
    case 'pot': {
      if (e.type !== 'settled') return stay();
      if (e.potted) return go({ say: 'Nice pot!' });
      const tries = s.tries + 1;
      return stay({
        state: { ...s, tries },
        reset: true,
        say:
          tries >= 2
            ? 'Tip: in the top view the guide line shows exactly where the 1 will go.'
            : 'Close. Try again.',
      });
    }
    case 'spin':
      return e.type === 'spin' ? go() : stay();
    case 'camera':
      return e.type === 'camera' ? go() : stay();
    case 'done':
      return stay();
  }
}

const SEEN_KEY = 'cuesports.tutorial';

export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return true;
  }
}

export function markTutorialSeen(how: 'done' | 'skipped'): void {
  try {
    localStorage.setItem(SEEN_KEY, how);
  } catch {
    /* private mode: the offer comes back next time */
  }
}
