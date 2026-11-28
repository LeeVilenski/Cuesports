import { describe, expect, it } from 'vitest';
import { acceptSponsor, ceiling, declineOffer, enterEvent, pickNickname, playMatch, restWeek } from './agent';
import { newPlayer, shotTuning } from './attributes';
import { careerEvent, newCareer, type CareerState } from './career';
import {
  buyCue,
  buyKit,
  coach,
  COACHING_XP,
  coachingPrice,
  cueBonus,
  CUES,
  equipCue,
  isRival,
  KIT_PRICES,
  nicknameChoices,
  rivals,
} from './economy';
import { WEEKS } from './season';

function play(s: CareerState, id: string, wins: number, seed = 1): CareerState {
  s = enterEvent(s, careerEvent(id)!, seed);
  let i = 0;
  while (s.run?.status === 'playing') s = playMatch(s, i++ < wins, seed + 10 + i);
  return s;
}

describe('the shop', () => {
  it('sells cues with small stats, and you can switch between the ones you own', () => {
    for (const c of CUES) for (const v of Object.values(c.bonus)) expect(Math.abs(v)).toBeLessThanOrEqual(5);
    const s = { ...newCareer(), money: 1000 };
    const b = buyCue(s, 'lowdef');
    expect(b.money).toBe(100);
    expect(b.cue).toBe('lowdef');
    expect(cueBonus(b)).toEqual({ touch: 5 });
    expect(buyCue(b, 'ebony')).toBe(b);
    expect(equipCue(b, 'house').cue).toBe('house');
    expect(equipCue(b, 'ebony')).toBe(b);
    // The cue's points reach the shot.
    const p = newPlayer();
    expect(shotTuning(p, 'nine-ball', 0, { touch: 5 }).squirt).toBeGreaterThan(
      shotTuning(p, 'nine-ball').squirt,
    );
  });

  it('sells the career kit, as well as giving it for titles', () => {
    const key = Object.keys(KIT_PRICES)[0]!;
    const s = { ...newCareer(), money: 1000 };
    const b = buyKit(s, key);
    expect(b.unlocked).toContain(key);
    expect(b.money).toBe(1000 - KIT_PRICES[key]!);
    expect(buyKit(b, key)).toBe(b);
    expect(buyKit({ ...newCareer(), money: 0 }, key).unlocked).not.toContain(key);
  });

  it('sells one coaching session a week, never past the ceiling', () => {
    const s = { ...newCareer(), money: 500 };
    const c = coach(s, 'vision', ceiling(s));
    expect(c.money).toBe(500 - coachingPrice(s));
    expect(c.player.ratings.vision + c.player.xp.vision).toBeGreaterThan(s.player.ratings.vision);
    expect(c.lastGains?.xp.vision).toBe(COACHING_XP);
    expect(coach(c, 'cueing', ceiling(c))).toBe(c);
    expect(coach(restWeek(c), 'cueing', ceiling(c)).money).toBeLessThan(c.money);
    const capped = { ...s, player: { ...s.player, ratings: { ...s.player.ratings, spin: 40 } } };
    expect(coach(capped, 'spin', 40)).toBe(capped);
  });
});

describe('sponsors and nicknames', () => {
  it('offers a sponsor once you have two titles, and pays the bonus for enough semi-finals', () => {
    let s: CareerState = { ...newCareer(), seed: 4 };
    s = play(s, 'lion-9ball', 99);
    expect(s.inbox.some((m) => m.action?.kind === 'sponsor')).toBe(false);
    s = play(s, 'lion-uk8', 99);
    const offer = s.inbox.find((m) => m.action?.kind === 'sponsor')!;
    expect(offer).toBeDefined();
    const before = s.money;
    s = acceptSponsor(s, offer.id);
    expect(s.sponsor?.season).toBe(1);
    expect(s.money).toBeGreaterThan(before);
    expect(acceptSponsor(s, offer.id)).toBe(s);
    // A season of semi-finals: the bonus at the review.
    s = play(s, 'lion-9ball', 99);
    while (s.season === 1) s = restWeek(s);
    expect(s.inbox.find((m) => m.id === 'season-1')?.body).toMatch(/bonus is in your account/);
    // A new offer for the new season.
    expect(s.inbox.some((m) => m.id === 'sponsor-2')).toBe(true);
  });

  it('can be turned down', () => {
    let s: CareerState = { ...newCareer() };
    s = play(play(s, 'lion-9ball', 99), 'lion-uk8', 99);
    const id = s.inbox.find((m) => m.action?.kind === 'sponsor')!.id;
    const no = declineOffer(s, id);
    expect(no.sponsor).toBeNull();
    expect(no.inbox.find((m) => m.id === id)?.done).toBe(true);
  });

  it('offers a nickname after three titles', () => {
    let s: CareerState = { ...newCareer(), seed: 8 };
    s = play(play(play(s, 'lion-9ball', 99), 'lion-uk8', 99), 'club-9ball', 99);
    const m = s.inbox.find((x) => x.id === 'nickname')!;
    expect(m.action?.kind).toBe('nickname');
    const choice = nicknameChoices(s)[0]!;
    s = pickNickname(s, 'nickname', choice);
    expect(s.nickname).toBe(choice);
    expect(pickNickname(s, 'nickname', 'Nobody')).toBe(s);
  });
});

describe('rivals', () => {
  it('are the players who keep beating you, and Joe names them', () => {
    let s: CareerState = { ...newCareer() };
    expect(rivals(s)).toEqual([]);
    s = { ...s, h2h: { gaz: [1, 3], priya: [2, 2], 'pool-3': [0, 2] } };
    const r = rivals(s);
    expect(r.map((x) => x.id).sort()).toEqual(['gaz', 'pool-3']);
    expect(isRival(s, 'priya')).toBe(false);
    // Three defeats to the same player brings a message.
    let t: CareerState = { ...newCareer(), h2h: {} };
    for (let i = 0; i < 3; i++) {
      t = enterEvent({ ...t, run: null }, careerEvent('lion-9ball')!, 1);
      const opp = t.run!.entrants[1]!.id;
      t = { ...t, h2h: { ...t.h2h, [opp]: [0, i] } };
      t = playMatch(t, false, 2);
      if (i === 2) expect(t.inbox.some((m) => m.id === `nemesis-${opp}`)).toBe(true);
    }
  });

  it('plays a full season without trouble', () => {
    let s: CareerState = { ...newCareer(), seed: 3 };
    for (let w = 0; w < WEEKS; w++) s = restWeek(s);
    expect(s.season).toBe(2);
  });
});
