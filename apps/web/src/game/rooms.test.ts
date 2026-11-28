import { describe, expect, it } from 'vitest';
import { EVENTS, VENUES, venueOf } from './career';
import { isRoomId, ROOMS } from './rooms';
import { MAJOR_WEEKS, TOUR_VENUES, tourEvent, type TourEventKind } from './tour-events';
import { TOURS } from './roster';

describe('venue rooms', () => {
  it('gives every venue a room', () => {
    for (const v of [...VENUES, ...TOUR_VENUES]) expect(isRoomId(v.room)).toBe(true);
    expect(new Set(ROOMS.map((r) => r.id)).size).toBe(ROOMS.length);
  });

  it('plays every circuit event in its own venue', () => {
    for (const e of EVENTS) expect(venueOf(e).id).toBe(e.venue);
  });

  it('takes the tours from the hall to the manor, the palace, the arena and the theatre', () => {
    const rooms = new Set<string>();
    for (const t of TOURS)
      for (let week = 1; week <= 12; week++)
        for (const kind of ['challenge', 'ranking', 'major', 'qschool', 'finals'] as TourEventKind[]) {
          if (kind === 'major' && !MAJOR_WEEKS.includes(week)) continue;
          const e = tourEvent(t.id, 1, week, kind);
          const v = TOUR_VENUES.find((x) => x.id === e.venue);
          expect(v).toBeDefined();
          rooms.add(v!.room);
          if (kind === 'challenge' || kind === 'qschool') expect(v!.room).toBe('sportshall');
        }
    expect([...rooms].sort()).toEqual(['arena', 'exhibition', 'manor', 'palace', 'sportshall', 'theatre']);
  });
});
