import { layout, simulate } from '@cuesports/physics';
import { AMERICAN_POOL_9FT } from '@cuesports/shared';
import { describe, expect, it } from 'vitest';
import { cueFor, cuesFor, due, loudness, QUIET } from './cues';

describe('sound cues', () => {
  it('gets louder with impact speed, silent when settling', () => {
    expect(loudness(QUIET / 2, 6)).toBe(0);
    expect(loudness(0.5, 6)).toBeLessThan(loudness(3, 6));
    expect(loudness(50, 6)).toBe(1);
  });

  it('maps each kind of event', () => {
    expect(cueFor({ type: 'strike', t: 0, ball: 'cue', speed: 4, miscue: true })!.kind).toBe('miscue');
    expect(cueFor({ type: 'ball', t: 1, a: 'cue', b: '1', speed: 2 })!.kind).toBe('click');
    expect(cueFor({ type: 'ball', t: 1, a: 'cue', b: '1', speed: 0.001 })).toBeNull();
    const jaw = cueFor({ type: 'cushion', t: 1, ball: '1', segment: 's', kind: 'jaw', speed: 1 });
    expect(jaw!.kind).toBe('jaw');
    expect(cueFor({ type: 'pocket', t: 2, ball: '1', pocket: 'top-right' })!.kind).toBe('drop');
    expect(cueFor({ type: 'state', t: 2, ball: '1', from: 'sliding', to: 'rolling' })).toBeNull();
  });

  it('gives a real break a strike first and plenty of clicks', () => {
    const t = AMERICAN_POOL_9FT;
    const r = simulate(
      t,
      layout(t, 'nine-ball', 2),
      { ball: 'cue', aim: 0, elevation: 0, tip: { a: 0, b: 0 }, speed: 8 },
      { sampleRate: 0 },
    );
    const cues = cuesFor(r.events);
    expect(cues[0]!.kind).toBe('strike');
    expect(cues.filter((c) => c.kind === 'click').length).toBeGreaterThan(5);
    expect(cues.every((c, i) => i === 0 || c.t >= cues[i - 1]!.t)).toBe(true);
    // Every sound is due exactly once as playback steps through.
    let n = 0;
    for (let s = 0; s < r.duration + 0.1; s += 1 / 60) n += due(cues, s, s + 1 / 60).length;
    expect(n + due(cues, -1, 0).length).toBe(cues.length);
  });
});

describe('synthesised sounds', () => {
  it('are short, clean and loud enough', async () => {
    const { synth } = await import('./synth');
    for (const kind of ['click', 'strike', 'miscue', 'cushion', 'jaw', 'drop'] as const) {
      const x = synth(kind, 44100);
      expect(x.length).toBeGreaterThan(1000);
      expect(x.length).toBeLessThan(44100);
      let peak = 0;
      for (const v of x) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak).toBeGreaterThan(0.5);
      expect(peak).toBeLessThanOrEqual(1);
      // Each sound dies away by its end.
      expect(Math.abs(x[x.length - 1]!)).toBeLessThan(0.05);
    }
  });
});
