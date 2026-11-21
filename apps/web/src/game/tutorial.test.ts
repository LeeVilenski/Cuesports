import { describe, expect, it } from 'vitest';
import { advance, newTutorial, stepOf, type TutorialEvent } from './tutorial';

const run = (events: TutorialEvent[]) => events.reduce((s, e) => advance(s, e).state, newTutorial());

describe('tutorial', () => {
  it('goes through the steps in order', () => {
    const s = run([
      { type: 'aim', amount: 0.1 },
      { type: 'aim', amount: -0.1 },
      { type: 'shot' },
      { type: 'settled', potted: false },
      { type: 'settled', potted: true },
      { type: 'spin' },
      { type: 'camera' },
    ]);
    expect(stepOf(s).id).toBe('done');
  });
  it('ignores events for other steps', () => {
    expect(stepOf(run([{ type: 'spin' }, { type: 'camera' }])).id).toBe('aim');
  });
  it('resets the table after a miss and hints on the second', () => {
    let s = run([{ type: 'aim', amount: 1 }, { type: 'settled', potted: false }]);
    const a = advance(s, { type: 'settled', potted: false });
    expect(a.reset).toBe(true);
    s = a.state;
    const b = advance(s, { type: 'settled', potted: false });
    expect(b.say).toMatch(/Tip/);
    expect(stepOf(b.state).id).toBe('pot');
  });
  it('skips the pot step if the first shot pots', () => {
    const s = run([{ type: 'aim', amount: 1 }, { type: 'settled', potted: true }]);
    expect(stepOf(s).id).toBe('spin');
  });
});
