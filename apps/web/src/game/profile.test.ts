import { describe, expect, it } from 'vitest';
import { PRESETS } from '../render/figure';
import { buildId, DEFAULT_PROFILE, fromPreset, loadProfile, saveProfile } from './profile';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('profile', () => {
  it('round-trips through storage', () => {
    const s = memory();
    const p = {
      ...DEFAULT_PROFILE,
      name: 'Ann',
      cue: { wood: 'ebony' as const, ferrule: 'ivory' as const, wrap: '#141414' },
    };
    saveProfile(p, s);
    expect(loadProfile(s)).toEqual(p);
  });

  it('fills in anything an older save is missing', () => {
    const s = memory();
    s.setItem('cuesports.profile', JSON.stringify({ name: 'Bo', look: { hairStyle: 'curly' } }));
    const p = loadProfile(s);
    expect(p.name).toBe('Bo');
    expect(p.look.hairStyle).toBe('curly');
    expect(p.look.skin).toBe(DEFAULT_PROFILE.look.skin);
    expect(p.cue).toEqual(DEFAULT_PROFILE.cue);
    expect(p.cloth).toEqual(DEFAULT_PROFILE.cloth);
  });

  it('survives broken or missing data', () => {
    const s = memory();
    s.setItem('cuesports.profile', '{nope');
    expect(loadProfile(s)).toEqual(DEFAULT_PROFILE);
    expect(loadProfile(null)).toEqual(DEFAULT_PROFILE);
  });

  it('starts from a preset but keeps the name, cue and cloth', () => {
    const p = { ...DEFAULT_PROFILE, name: 'Ann' };
    const q = fromPreset(p, PRESETS[5]!);
    expect(q.name).toBe('Ann');
    expect(q.look.hairStyle).toBe(PRESETS[5]!.hairStyle);
    expect(q.cue).toBe(p.cue);
  });

  it('matches every preset build to the nearest option', () => {
    expect(buildId(PRESETS[3]!.build)).toBe('slim');
    expect(buildId(PRESETS[5]!.build)).toBe('heavy');
    expect(buildId(PRESETS[0]!.build)).toBe('average');
  });
});
