import { Rng } from '@cuesports/shared';
import type { RoomId } from '../../game/rooms';
import * as art from './art';
import { RoomBuilder, type BuiltRoom, type TableFootprint } from './builder';
import {
  chairs,
  chandelier,
  otherTable,
  picture,
  sconce,
  seated,
  shell,
  stand,
  standing,
  tableLamp,
  vault,
  windowPane,
} from './parts';

/**
 * The rooms, from a local pub to a full arena. Each is sized round the table it holds (so a snooker
 * table gets the same space to play in as a pool table) and keeps the floor round the table clear
 * for the players and their chairs.
 */

export interface RoomMood {
  /** Background and fog colour. */
  bg: string;
  fog: [number, number];
  /** Hemisphere fill on the table and players. */
  hemi: number;
  /** The table lights. */
  light: string;
  power: number;
  /** Furthest the free camera may orbit, to stay inside the room. */
  orbit: number;
}

export interface Room extends BuiltRoom {
  id: RoomId;
  mood: RoomMood;
}

export interface RoomOptions {
  /** Picks the variation (which pub, whose portraits, who's in the crowd). */
  seed: number;
  /** 0.5 … 1. */
  detail: number;
  /** The venue's name, for its signs. */
  name?: string;
  /** What's on: for the screens. */
  event?: string;
}

type Make = (t: TableFootprint, o: RoomOptions) => { b: RoomBuilder; mood: Omit<RoomMood, 'orbit'> };

const PI = Math.PI;
const HALF = Math.PI / 2;

export function buildRoom(id: RoomId, t: TableFootprint, o: RoomOptions): Room {
  const { b, mood } = MAKERS[id](t, o);
  const built = b.build();
  return { ...built, id, mood: { ...mood, orbit: Math.min(8, Math.min(b.X, b.Y) - 0.4) } };
}

export const PUB_NAMES = [
  'The Fox & Hounds',
  'The Crown',
  'The Old Bell',
  'The Plough',
  'The White Hart',
  'The Kings Head',
  'The Ship',
  'The Rose & Crown',
  'The Wheatsheaf',
  'The Coach House',
  'The Black Horse',
  'The Anchor',
];

const PUB_PALETTES = [
  {
    high: '#5e1a1c',
    ink: '#6c2224',
    wood: '#3a2213',
    carpet: ['#3d0f16', '#7a5a26', '#a07a2e'],
    leather: '#5a1a16',
  },
  {
    high: '#1d3a2a',
    ink: '#24452f',
    wood: '#2e1c10',
    carpet: ['#14261c', '#6a5a2a', '#8a2a2a'],
    leather: '#3a2a18',
  },
  {
    high: '#1c2742',
    ink: '#24304f',
    wood: '#3d2817',
    carpet: ['#1a1e3a', '#7a6a3a', '#9a3a2a'],
    leather: '#4a1a1a',
  },
  {
    high: '#7a5b2a',
    ink: '#6e5124',
    wood: '#2c1a0e',
    carpet: ['#4a1a12', '#8a6a2a', '#2a4a6a'],
    leather: '#1f3a2a',
  },
];

// -----------------------------------------------------------------------------------------------
// The pub

const pub: Make = (t, o) => {
  const rng = new Rng(o.seed);
  const X = Math.max(5.2, t.hx + 3.4);
  const Y = Math.max(4.4, t.hy + 3.6);
  const b = new RoomBuilder(X, Y, 2.7, t, rng, o.detail);
  const p = PUB_PALETTES[o.name === 'The Red Lion' ? 0 : rng.int(PUB_PALETTES.length)]!;
  const name = o.name ?? PUB_NAMES[rng.int(PUB_NAMES.length)]!;
  b.ambient.setRGB(0.15, 0.1, 0.065);
  b.sky = 0.1;
  const carpet = b.texMat(
    b.tile(b.tex(256, 256, art.carpet(p.carpet[0]!, p.carpet[1]!, p.carpet[2]!, rng, rng.int(2))), 0.9),
  );
  const panels = b.texMat(b.tile(b.tex(256, 128, art.panelling(p.wood, 2)), 1.2, 1.0));
  const paper = b.texMat(b.tile(b.tex(128, 128, art.wallpaper(p.high, p.ink, rng.next() < 0.5)), 0.5));
  shell(b, { floor: carpet, low: panels, high: paper, dado: 1.0, trim: '#24140a', ceiling: '#cdbf9f' });
  // Beams.
  for (let x = -X + 0.7; x < X; x += 1.35)
    b.box(0.16, 2 * Y, 0.2, x, 0, b.H - 0.2, { color: '#2a180c', hang: true });

  // The bar, along the back wall.
  b.onWall('N', (len) => {
    const bl = Math.min(5.6, len - 2.6);
    b.panel(bl, 1.1, 0, 0.02, 1.65, HALF, {
      mat: b.texMat(b.tex(512, 160, art.backBar(rng))),
      glow: true,
      color: '#d8d8d8',
    });
    b.box(bl, 0.4, 0.95, 0, 0.22, 0, { color: p.wood });
    b.box(bl + 0.1, 0.62, 1.04, 0, 1.3, 0, { color: p.wood });
    b.box(bl + 0.2, 0.74, 0.05, 0, 1.3, 1.04, { color: '#1c0f07' });
    b.box(bl + 0.2, 0.04, 0.04, 0, 1.7, 0.2, { color: '#b08a3a' });
    for (let i = 0; i < 5; i++) {
      const x = -0.9 + i * 0.45;
      b.cyl(0.025, 0.03, 0.28, x, 1.2, 1.09, { color: '#c0a060' }, 8);
      b.box(0.05, 0.05, 0.2, x, 1.2, 1.37, { color: ['#1a1a1a', '#e8e0d0', '#7a1a1a'][i % 3]! });
      b.box(0.08, 0.01, 0.1, x, 1.17, 1.42, {
        color: ['#d8a020', '#2a6ad0', '#c03020', '#e8e8e8', '#20a060'][i]!,
        glow: true,
      });
    }
    for (let i = 0; i < 3; i++)
      b.cyl(0.035, 0.03, 0.15, 1.2 + i * 0.4, 1.35, 1.09, { color: '#c9821c', glow: true }, 8);
    b.panel(2.4, 0.36, 0, 0.03, 2.43, HALF, {
      mat: b.texMat(
        b.tex(
          512,
          80,
          art.sign(name.toUpperCase(), '#d8b25a', '#160c05', 'bold 54px Georgia, serif', '#8a6a2a'),
        ),
      ),
    });
    for (let i = 0; i < Math.floor(bl / 0.75); i++) {
      const x = -bl / 2 + 0.4 + i * 0.75;
      b.cyl(0.025, 0.025, 0.72, x, 1.95, 0, { color: '#2a2a2a' }, 6);
      b.cyl(0.17, 0.17, 0.06, x, 1.95, 0.72, { color: p.leather }, 12);
    }
    b.lamp(0, 1.0, 2.25, '#ffcf8a', 0.9, 2.2);
    sconce(b, -len / 2 + 0.7, 1.9, '#ffcf8a');
    sconce(b, len / 2 - 0.7, 1.9, '#ffcf8a');
  });

  // Darts at one end; a fire or a jukebox at the other.
  const dartsWest = rng.next() < 0.5;
  b.onWall(dartsWest ? 'W' : 'E', (len) => {
    const u = len * 0.18;
    b.box(0.66, 0.07, 0.66, u, 0, 1.4, { color: '#24140a' });
    b.disc(0.23, u, 0.075, 1.73, HALF, { mat: b.texMat(b.tex(256, 256, art.dartboard())) }, 28);
    b.panel(0.5, 0.7, u + 0.8, 0.02, 1.6, HALF, { color: '#1c201c' });
    b.box(0.62, 0.05, 0.012, u, 2.37, 0, { color: '#b08a3a' });
    b.lamp(u, 0.6, 2.2, '#fff0d0', 0.4, 1.1);
    picture(b, -len * 0.25, 1.6, 0.6, 0.45, b.texMat(b.tex(128, 96, art.portrait(rng))), '#2a180c');
    sconce(b, -len / 2 + 0.6, 1.9, '#ffcf8a');
  });
  b.onWall(dartsWest ? 'E' : 'W', (len) => {
    if (rng.next() < 0.6) {
      b.box(1.6, 0.35, b.H, 0, 0.17, 0, { color: p.high });
      b.box(1.25, 0.14, 1.05, 0, 0.4, 0, { color: '#6a5e50' });
      b.panel(0.66, 0.58, 0, 0.475, 0.37, HALF, { color: '#080605' });
      b.panel(0.5, 0.3, 0, 0.48, 0.2, HALF, { mat: b.texMat(b.tex(128, 80, art.fire(rng))), glow: true });
      b.box(1.45, 0.28, 0.07, 0, 0.42, 1.05, { color: p.wood });
      picture(
        b,
        0,
        1.75,
        0.8,
        0.5,
        b.texMat(b.tex(128, 96, art.nightWindow(1, 1, '#4a5a6a', '#8a9aaa'))),
        '#b08a3a',
      );
      b.lamp(0, 0.9, 0.35, '#ff7a20', 0.7, 1.3);
    } else {
      b.box(0.8, 0.6, 1.5, 0, 0.3, 0, { color: '#3a1a0a' });
      b.panel(0.66, 0.9, 0, 0.61, 0.95, HALF, {
        mat: b.texMat(b.tex(128, 180, art.screen('Jukebox', '50p a song', 300))),
        glow: true,
      });
      b.lamp(0, 0.9, 1.0, '#ff60c0', 0.4, 1.2);
    }
    for (const s of [-1, 1])
      picture(
        b,
        s * len * 0.3,
        1.65,
        0.45,
        0.6,
        b.texMat(
          b.tex(
            96,
            128,
            art.poster(s < 0 ? 'POOL NIGHT' : 'QUIZ', s < 0 ? 'THURSDAYS' : 'SUNDAYS 8PM', rng.int(360)),
          ),
        ),
        '#111',
      );
  });

  // Windows and booths along the front.
  b.onWall('S', (len) => {
    const n = Math.max(2, Math.floor(len / 2.4));
    const glass = b.texMat(b.tex(128, 128, art.nightWindow(2, 3, '#1a2238', '#5a4a30', true)));
    for (let i = 0; i < n; i++) {
      const u = -len / 2 + ((i + 0.5) * len) / n;
      windowPane(b, u, 1.6, 1.1, 1.1, glass, '#1c0f07', { brightness: '#c8c0b0' });
      b.box(1.7, 0.5, 0.45, u, 0.28, 0, { color: p.leather });
      b.box(1.7, 0.12, 0.5, u, 0.06, 0.45, { color: p.leather });
      b.cyl(0.32, 0.32, 0.04, u, 1.0, 0.7, { color: '#2a180c' }, 14);
      b.cyl(0.04, 0.2, 0.7, u, 1.0, 0, { color: '#151515' }, 8);
      for (let k = 0; k < 2; k++)
        b.cyl(0.035, 0.03, 0.14, u - 0.1 + k * 0.2, 0.95, 0.74, { color: '#c9821c', glow: true }, 8);
      if (rng.next() < 0.5 * o.detail) {
        seated(b, u - 0.4, 0.3, 0.45, HALF);
        if (rng.next() < 0.6) seated(b, u + 0.4, 0.3, 0.45, HALF);
      }
      sconce(b, u + len / n / 2, 1.9, '#ffcf8a', 0.3);
    }
  });
  // A couple of regulars at the bar.
  for (let i = 0; i < Math.round(2 * o.detail); i++)
    standing(b, -1.5 + i * 2.6, Y - 2.1, -HALF + rng.range(-0.4, 0.4));
  tableLamp(b, 'shades', { shade: rng.next() < 0.5 ? '#1f5a32' : '#6a1a1a', frame: '#6a5020' });
  return { b, mood: { bg: '#140c06', fog: [9, 22], hemi: 0.26, light: '#ffd9a8', power: 2.3 } };
};

// -----------------------------------------------------------------------------------------------
// The pool club: a row of tables under their lamps.

const club: Make = (t, o) => {
  const rng = new Rng(o.seed);
  const X = Math.max(5.6, t.hx + 3.6);
  const gap = 2 * t.hy + 2.9;
  const Y = gap + t.hy + 1.6;
  const b = new RoomBuilder(X, Y, 3.0, t, rng, o.detail);
  b.ambient.setRGB(0.06, 0.065, 0.075);
  b.sky = 0.1;
  const floor = b.texMat(b.tile(b.tex(128, 128, art.fleck('#2a3040', rng, 2500, 2)), 1));
  const low = b.texMat(b.tile(b.tex(128, 128, art.fleck('#1d2a24', rng, 1500)), 1));
  const high = b.texMat(b.tile(b.tex(128, 128, art.fleck('#3a4743', rng, 1500)), 1));
  const ceil = b.texMat(b.tile(b.tex(128, 128, art.fleck('#222326', rng, 800, 2)), 1.2));
  shell(b, { floor, low, high, dado: 1.1, trim: '#0e0e0e', ceiling: ceil });
  const cloths = ['#1f5a9a', '#1d6b3a', '#7a1f2a', '#2a6a6a'];
  for (const s of [-1, 1])
    otherTable(b, 0, s * gap, {
      cloth: cloths[rng.int(4)]!,
      wood: '#1a1410',
      covered: rng.next() < 0.25,
      shade: '#1a1a1a',
    });
  const name = o.name ?? 'Corner Pocket';
  b.onWall('E', (len) => {
    b.panel(2.6, 0.7, 0, 0.04, 2.2, HALF, {
      mat: b.texMat(b.tex(512, 140, art.neon(name.replace(/ Club$/, ''), '#ff3c8a'))),
      glow: true,
    });
    b.lamp(0, 0.6, 2.2, '#ff3c8a', 0.5, 1.6);
    picture(b, -len * 0.3, 1.55, 0.9, 0.36, b.texMat(b.tex(256, 100, art.markerBoard())), '#2a1a0c');
    picture(
      b,
      len * 0.3,
      1.6,
      0.5,
      0.7,
      b.texMat(b.tex(100, 140, art.poster('9-BALL OPEN', 'FRIDAYS', 210))),
      '#111',
    );
  });
  b.onWall('W', (len) => {
    // The counter and the drinks fridge.
    b.box(2.4, 0.6, 1.05, -len * 0.18, 0.9, 0, { color: '#2a2a2e' });
    b.box(2.5, 0.7, 0.04, -len * 0.18, 0.9, 1.05, { color: '#111' });
    b.box(0.8, 0.6, 1.9, len * 0.12, 0.3, 0, { color: '#d8d8d8' });
    b.panel(0.64, 1.5, len * 0.12, 0.61, 1.05, HALF, {
      mat: b.texMat(b.tex(64, 160, art.backBar(rng))),
      glow: true,
      color: '#c8e8ff',
    });
    b.lamp(len * 0.12, 1.0, 1.1, '#bfe0ff', 0.4, 1.2);
    b.lamp(-len * 0.18, 1.4, 2.4, '#fff1d6', 0.5, 1.6);
    picture(
      b,
      -len * 0.18,
      2.1,
      1.4,
      0.5,
      b.texMat(
        b.tex(256, 90, art.sign('TABLES £6 / HOUR', '#ffd34d', '#151515', 'bold 46px Arial, sans-serif')),
      ),
      '#111',
      true,
    );
  });
  for (const side of ['N', 'S'] as const) {
    b.onWall(side, (len) => {
      // A cue rack, benches and the odd poster.
      b.box(1.2, 0.06, 0.12, -len * 0.25, 0.03, 1.55, { color: '#3a2414' });
      b.box(1.2, 0.1, 0.06, -len * 0.25, 0.05, 0.12, { color: '#3a2414' });
      for (let i = 0; i < 9; i++)
        b.cyl(
          0.008,
          0.015,
          1.45,
          -len * 0.25 - 0.5 + i * 0.125,
          0.07,
          0.15,
          { color: i % 3 ? '#c8a878' : '#2a1a10' },
          5,
        );
      b.box(2.6, 0.45, 0.45, len * 0.15, 0.25, 0, { color: '#1a1a1a' });
      if (rng.next() < 0.7 * o.detail) seated(b, len * 0.15 - 0.5, 0.28, 0.45, HALF);
      picture(
        b,
        len * 0.38,
        1.7,
        0.5,
        0.7,
        b.texMat(
          b.tex(
            100,
            140,
            art.poster(
              side === 'N' ? 'LEAGUE NIGHT' : 'KILLER',
              side === 'N' ? 'TUESDAYS' : 'SATURDAYS',
              rng.int(360),
            ),
          ),
        ),
        '#111',
      );
      b.disc(0.16, -len * 0.45, 0.03, 2.3, HALF, { color: '#f0f0f0' }, 20);
    });
  }
  // Someone playing on the next table.
  if (o.detail > 0.6) standing(b, -t.hx - 0.4, gap, 0);
  tableLamp(b, 'shades', { shade: '#1a1a1a', frame: '#1a1a1a' });
  return { b, mood: { bg: '#07090a', fog: [10, 26], hemi: 0.14, light: '#fff1dc', power: 2.6 } };
};

// -----------------------------------------------------------------------------------------------
// The sports and social club: oak, honours, trophies.

const social: Make = (t, o) => {
  const rng = new Rng(o.seed);
  const X = Math.max(5.6, t.hx + 3.6);
  const Y = Math.max(4.8, t.hy + 3.8);
  const b = new RoomBuilder(X, Y, 3.1, t, rng, o.detail);
  b.ambient.setRGB(0.11, 0.09, 0.065);
  const floor = b.texMat(b.tile(b.tex(256, 256, art.planks('#6b4423', rng, 8, true)), 1.2));
  const oak = b.texMat(b.tile(b.tex(256, 160, art.panelling('#4a2c16', 2)), 1.1, 1.3));
  const green = b.texMat(b.tile(b.tex(128, 128, art.fleck('#23382b', rng, 1200)), 1));
  shell(b, { floor, low: oak, high: green, dado: 1.3, trim: '#2a180a', ceiling: '#cfc4a8' });
  for (const side of ['N', 'S', 'E', 'W'] as const)
    b.onWall(side, (len) => b.box(len, 0.04, 0.05, 0, 0.02, 2.4, { color: '#2a180a' }));
  const name = o.name ?? 'The Cannon Room';
  b.onWall('N', (len) => {
    picture(
      b,
      0,
      2.05,
      1.9,
      1.25,
      b.texMat(b.tex(512, 340, art.honours(`${name.toUpperCase()} CHAMPIONS`, rng))),
      '#2a180a',
    );
    for (const s of [-1, 1]) {
      picture(b, s * 1.7, 1.95, 0.5, 0.38, b.texMat(b.tex(128, 96, art.portrait(rng))), '#111');
      sconce(b, s * 1.25, 2.2, '#ffd9a0', 0.35);
    }
    // The bar hatch.
    b.box(1.4, 0.1, 0.06, len / 2 - 1.2, 0.05, 1.05, { color: '#2a180a' });
    b.panel(1.2, 0.8, len / 2 - 1.2, 0.02, 1.5, HALF, {
      mat: b.texMat(b.tex(256, 170, art.backBar(rng))),
      glow: true,
      color: '#b0a090',
    });
    b.lamp(len / 2 - 1.2, 0.6, 1.6, '#ffcf8a', 0.5, 1.3);
  });
  b.onWall('W', (len) => {
    // The trophy cabinet.
    b.box(2.2, 0.45, 2.0, 0, 0.22, 0, { color: '#2a180a' });
    b.panel(2.0, 1.4, 0, 0.455, 1.25, HALF, { color: '#3a4038', glow: true });
    for (let s = 0; s < 3; s++) {
      const z = 0.6 + s * 0.48;
      b.box(2.0, 0.3, 0.025, 0, 0.3, z, { color: '#c8c8c0' });
      for (let i = 0; i < 5; i++) {
        const x = -0.8 + i * 0.4 + rng.range(-0.05, 0.05);
        const h = 0.18 + rng.next() * 0.18;
        b.box(0.08, 0.08, 0.04, x, 0.3, z + 0.025, { color: '#1a1a1a' });
        b.cyl(0.012, 0.012, h * 0.4, x, 0.3, z + 0.065, { color: '#d4af37' }, 6);
        b.cyl(
          0.07,
          0.03,
          h * 0.5,
          x,
          0.3,
          z + 0.065 + h * 0.4,
          { color: rng.next() < 0.7 ? '#d4af37' : '#c0c0c8' },
          10,
        );
      }
    }
    b.lamp(0, 0.8, 1.6, '#fff0d0', 0.5, 1.4);
    picture(b, -len * 0.3, 1.8, 0.6, 0.45, b.texMat(b.tex(128, 96, art.portrait(rng))), '#b08a3a');
    picture(b, len * 0.3, 1.8, 0.6, 0.45, b.texMat(b.tex(128, 96, art.portrait(rng))), '#b08a3a');
  });
  b.onWall('E', (len) => {
    picture(b, 0, 1.6, 1.4, 0.5, b.texMat(b.tex(256, 92, art.markerBoard())), '#2a180a');
    b.box(1.2, 0.06, 0.12, len * 0.3, 0.03, 1.55, { color: '#3a2414' });
    for (let i = 0; i < 8; i++)
      b.cyl(0.008, 0.015, 1.45, len * 0.3 - 0.45 + i * 0.13, 0.07, 0.15, { color: '#c8a878' }, 5);
    b.disc(0.17, -len * 0.3, 0.03, 2.1, HALF, { color: '#f0eadc' }, 20);
    sconce(b, -len * 0.3, 2.6, '#ffd9a0', 0.3);
  });
  // Raised settees along the front: the members watch from here.
  b.onWall('S', (len) => {
    const w = Math.min(len - 2, 6);
    b.box(w, 1.0, 0.3, 0, 0.5, 0, { color: '#2a180a' });
    b.box(w, 0.55, 0.42, 0, 0.35, 0.3, { color: '#1e3a26' });
    b.box(w, 0.14, 0.55, 0, 0.07, 0.72, { color: '#1e3a26' });
    for (let i = 0; i < Math.floor(w / 0.7); i++)
      if (rng.next() < 0.55 * o.detail) seated(b, -w / 2 + 0.35 + i * 0.7, 0.4, 0.72, HALF);
    for (const s of [-1, 1]) sconce(b, s * len * 0.35, 2.0, '#ffd9a0', 0.35);
  });
  tableLamp(b, 'canopy', { frame: '#3a2414', warm: '#fff0d8' });
  return { b, mood: { bg: '#0f0b07', fog: [10, 24], hemi: 0.2, light: '#fff0d8', power: 2.5 } };
};

// -----------------------------------------------------------------------------------------------
// The billiard café.

const cafe: Make = (t, o) => {
  const rng = new Rng(o.seed);
  const X = Math.max(5.6, t.hx + 3.6);
  const Y = Math.max(4.7, t.hy + 3.6);
  const b = new RoomBuilder(X, Y, 3.3, t, rng, o.detail);
  b.ambient.setRGB(0.15, 0.12, 0.09);
  const floor = b.texMat(b.tile(b.tex(128, 128, art.checker('#e8e0cc', '#1a1a1a')), 1.2));
  const low = b.texMat(b.tile(b.tex(256, 128, art.panelling('#3a1e10', 3)), 1.4, 1.0));
  const high = b.texMat(b.tile(b.tex(128, 128, art.fleck('#e2d6b8', rng, 800)), 1));
  shell(b, { floor, low, high, dado: 1.0, trim: '#2a1408', ceiling: '#d8ccb0' });
  for (const side of ['N', 'S', 'E', 'W'] as const)
    b.onWall(side, (len) => b.box(len, 0.14, 0.18, 0, 0.07, b.H - 0.18, { color: '#e8dcc0' }));
  const name = (o.name ?? 'Café Carambole').toUpperCase();
  b.onWall('S', (len) => {
    // The shop front: big windows on the street, the name in gold the right way round outside.
    const glass = b.texMat(
      b.tex(256, 256, (g, w, h) => {
        art.nightWindow(1, 1, '#0c1426', '#3b2a1a')(g, w, h);
        for (let i = 0; i < 5; i++) {
          g.fillStyle = `rgba(255,200,120,${0.3 + rng.next() * 0.4})`;
          g.beginPath();
          g.arc(rng.next() * w, h * (0.55 + rng.next() * 0.3), 4 + rng.next() * 8, 0, Math.PI * 2);
          g.fill();
        }
        g.save();
        g.scale(-1, 1);
        g.fillStyle = 'rgba(216,178,90,0.9)';
        g.font = 'bold 26px Georgia, serif';
        g.textAlign = 'center';
        g.fillText(name, -w / 2, h * 0.3);
        g.restore();
      }),
    );
    const n = Math.max(2, Math.floor(len / 3));
    for (let i = 0; i < n; i++) {
      const u = -len / 2 + ((i + 0.5) * len) / n;
      windowPane(b, u, 1.75, 2.0, 2.1, glass, '#1a0e06', { brightness: '#b8b0a0' });
      for (const s of [-1, 1]) {
        const x = u + s * 0.6;
        b.cyl(0.3, 0.3, 0.03, x, 0.9, 0.74, { color: '#efeae0' }, 16);
        b.cyl(0.025, 0.025, 0.74, x, 0.9, 0, { color: '#1a1a1a' }, 6);
        b.cyl(0.2, 0.2, 0.02, x, 0.9, 0, { color: '#1a1a1a' }, 10);
        b.cyl(0.035, 0.03, 0.09, x, 0.9, 0.77, { color: '#f0f0f0' }, 8);
        if (rng.next() < 0.5 * o.detail) seated(b, x + 0.45, 0.9, 0.45, PI);
        b.box(0.4, 0.4, 0.04, x - 0.45, 0.9, 0.45, { color: '#2a1408' });
        b.box(0.05, 0.4, 0.45, x - 0.66, 0.9, 0.47, { color: '#2a1408' });
        b.box(0.3, 0.3, 0.45, x - 0.45, 0.9, 0, { color: '#2a1408' });
      }
    }
  });
  b.onWall('N', (len) => {
    // The counter, the espresso machine and the cakes.
    b.box(4.0, 0.65, 1.05, -len * 0.15, 1.0, 0, { color: '#3a1e10' });
    b.box(4.1, 0.75, 0.05, -len * 0.15, 1.0, 1.05, { color: '#d8d0c0' });
    b.box(0.7, 0.45, 0.45, -len * 0.15 - 1.0, 1.0, 1.1, { color: '#b8b8c0' });
    b.box(0.6, 0.02, 0.2, -len * 0.15 - 1.0, 0.77, 1.3, { color: '#d02020', glow: true });
    b.box(1.0, 0.55, 0.4, -len * 0.15 + 0.8, 1.0, 1.1, { color: '#fff0d8', glow: true });
    b.panel(3.6, 1.1, -len * 0.15, 0.02, 1.85, HALF, {
      mat: b.texMat(b.tex(512, 160, art.backBar(rng))),
      glow: true,
      color: '#c8c0b0',
    });
    b.lamp(-len * 0.15, 1.2, 2.3, '#ffd9a0', 0.8, 2.0);
    picture(
      b,
      len * 0.3,
      1.9,
      1.4,
      1.0,
      b.texMat(b.tex(128, 96, art.fleck('#7a8a9a', rng, 300))),
      '#b08a3a',
      true,
    );
  });
  for (const side of ['E', 'W'] as const)
    b.onWall(side, (len) => {
      picture(
        b,
        0,
        2.0,
        0.7,
        1.0,
        b.texMat(
          b.tex(
            140,
            200,
            art.poster(
              side === 'E' ? 'CARAMBOLE' : 'TROIS BANDES',
              side === 'E' ? 'GRAND PRIX' : 'CHAMPIONNAT',
              side === 'E' ? 20 : 200,
            ),
          ),
        ),
        '#b08a3a',
      );
      for (const s of [-1, 1]) sconce(b, s * len * 0.3, 2.2, '#ffd9a0', 0.35);
    });
  for (const [x, y] of [
    [-X + 1.4, Y - 2.4],
    [X - 1.4, Y - 2.4],
    [-X + 1.4, -Y + 2.4],
    [X - 1.4, -Y + 2.4],
  ] as const) {
    b.ball(0.15, x, y, b.H - 0.95, { color: '#fff2d8', glow: true, hang: true }, 12);
    b.cyl(0.006, 0.006, 0.8, x, y, b.H - 0.8, { color: '#111', hang: true }, 4);
    b.lamp(x, y, b.H - 1.0, '#ffe2b8', 0.6, 2.0);
  }
  tableLamp(b, 'shades', { shade: '#b08a3a', frame: '#6a5020' });
  return { b, mood: { bg: '#100c08', fog: [10, 24], hemi: 0.26, light: '#ffe2b8', power: 2.4 } };
};

// -----------------------------------------------------------------------------------------------
// The sports hall: court lines, bleachers, a second table behind the boards.

const sportshall: Make = (t, o) => {
  const rng = new Rng(o.seed);
  const second = 2 * t.hx + 4.8;
  const X = Math.max(10.5, 3 * t.hx + 6.5);
  const Y = Math.max(8, t.hy + 7.3);
  const b = new RoomBuilder(X, Y, 7.5, t, rng, o.detail);
  b.ambient.setRGB(0.36, 0.38, 0.41);
  b.sky = 0.15;
  b.shadow = 0.55;
  b.flat(2 * X, 2 * Y, 0, 0, 0.002, { mat: b.texMat(b.tex(1024, 768, art.court(rng))) });
  const low = b.texMat(b.tile(b.tex(128, 128, art.fleck('#2f4f86', rng, 1500, 4)), 1.6, 0.8));
  const high = b.texMat(b.tile(b.tex(128, 128, art.fleck('#c9c6bd', rng, 1500, 4)), 1.6, 0.8));
  shell(b, { low, high, dado: 2.2, ceiling: '#8a8c92' });
  // Trusses and lights.
  for (let x = -X + 2; x < X; x += 3.5) {
    b.box(0.14, 2 * Y, 0.14, x, 0, b.H - 1.3, { color: '#5a5c62', hang: true });
    b.box(0.14, 2 * Y, 0.14, x, 0, b.H - 0.2, { color: '#5a5c62', hang: true });
    for (let y = -Y + 1; y < Y; y += 2)
      b.box(0.06, 0.06, 1.0, x, y, b.H - 1.16, { color: '#5a5c62', hang: true });
    for (let y = -Y + 3; y < Y - 1; y += 4) {
      b.box(0.7, 0.35, 0.1, x, y, b.H - 1.45, { color: '#3a3a3a', hang: true });
      b.flat(0.6, 0.28, x, y, b.H - 1.452, { color: '#f4f8ff', glow: true, hang: true }, true);
      b.lamp(x, y, b.H - 1.6, '#eef3ff', 0.55, 4.5);
    }
  }
  const high2 = b.texMat(b.tex(256, 64, art.nightWindow(8, 1, '#0d1a33', '#1b2c4a')));
  for (const side of ['N', 'S'] as const)
    b.onWall(side, (len) =>
      b.panel(len - 2, 1.0, 0, 0.01, 6.0, HALF, { mat: high2, glow: true, color: '#a0a8b8' }),
    );
  for (const side of ['E', 'W'] as const)
    b.onWall(side, () => {
      b.box(0.15, 1.3, 0.15, 0, 0.65, 3.4, { color: '#444' });
      b.panel(1.8, 1.05, 0, 1.31, 3.5, HALF, { color: '#f4f4f4' });
      b.box(0.45, 0.45, 0.02, 0, 1.55, 3.05, { color: '#e06010' });
      b.panel(3.2, 1.2, 0, 0.02, 1.2, HALF, { color: '#2a4a8a' });
    });
  // Wall bars.
  b.onWall('N', (len) => {
    for (let i = 0; i < 6; i++)
      b.box(0.08, 0.08, 2.6, -len / 2 + 1.5 + i * 0.9, 0.08, 0, { color: '#b08a5a' });
    for (let z = 0.2; z < 2.6; z += 0.15) b.rod(0.015, 4.6, -len / 2 + 3.75, 0.1, z, { color: '#c8a070' });
  });
  const name = o.name ?? 'Riverside Hall';
  stand(b, 'N', {
    dist: t.hy + 3.2,
    len: Math.min(2 * X - 6, 14),
    rows: 5,
    rise: 0.32,
    depth: 0.7,
    base: 0.2,
    seat: '#3a5aa0',
    step: '#6a6a70',
    fill: 0.35,
  });
  chairs(b, 'S', { dist: t.hy + 2.9, len: 2 * t.hx + 3, rows: 3, color: '#2a3a6a', fill: 0.35 });
  // Boards round the playing area, and another match on the next table.
  const boards = b.texMat(
    b.tex(
      512,
      64,
      art.sign(`${name.toUpperCase()}  ·  OPEN`, '#ffffff', '#1d3d7a', 'bold 40px Arial, sans-serif'),
    ),
  );
  for (const s of [-1, 1]) {
    b.panel(2 * t.hy + 4.6, 0.7, s * (t.hx + 2.4), 0, 0.35, s < 0 ? 0 : PI, { mat: boards });
    b.panel(2 * t.hy + 4.6, 0.7, s * (t.hx + 2.4), 0, 0.35, s < 0 ? PI : 0, { mat: boards });
    b.panel(2 * t.hx + 4.8, 0.7, 0, s * (t.hy + 2.3), 0.35, s < 0 ? HALF : -HALF, { mat: boards });
    b.panel(2 * t.hx + 4.8, 0.7, 0, s * (t.hy + 2.3), 0.35, s < 0 ? -HALF : HALF, { mat: boards });
    otherTable(b, s * second, 0, { cloth: '#1d6b3a', wood: '#2a1a10', lamp: 'canopy' });
    if (o.detail > 0.6) {
      standing(b, s * (second - t.hx - 0.5), 0.6, s < 0 ? 0 : PI);
      chairs(b, s < 0 ? 'W' : 'E', {
        dist: second + t.hx + 1.4,
        len: 4,
        rows: 2,
        color: '#2a3a6a',
        fill: 0.4,
      });
    }
  }
  tableLamp(b, 'canopy', { frame: '#1a1a1a' });
  return { b, mood: { bg: '#1a1d22', fog: [16, 40], hemi: 0.3, light: '#f2f6ff', power: 2.8 } };
};

// -----------------------------------------------------------------------------------------------
// The grand billiard hall: columns, chandeliers, tall windows.

const neva: Make = (t, o) => {
  const rng = new Rng(o.seed);
  const X = Math.max(7, t.hx + 5.2);
  const Y = Math.max(6, t.hy + 4.9);
  const b = new RoomBuilder(X, Y, 5.4, t, rng, o.detail);
  b.ambient.setRGB(0.12, 0.1, 0.075);
  const floor = b.texMat(b.tile(b.tex(256, 256, art.planks('#7a4e28', rng, 8, true)), 1.4));
  const low = b.texMat(b.tile(b.tex(128, 128, art.fleck('#1c3a2c', rng, 1500)), 1));
  const high = b.texMat(b.tile(b.tex(128, 128, art.wallpaper('#21463a', '#2b5646', true)), 0.9));
  shell(b, { floor, low, high, dado: 1.0, trim: '#d9cfb3', ceiling: '#e0d6bc' });
  const cream = '#d9cfb3';
  const gold = '#b8913e';
  const glass = b.texMat(b.tex(128, 256, art.nightWindow(2, 4, '#0b1630', '#24304a')));
  for (const side of ['N', 'S', 'E', 'W'] as const)
    b.onWall(side, (len) => {
      b.box(len, 0.25, 0.35, 0, 0.12, b.H - 0.35, { color: cream });
      b.box(len, 0.05, 0.06, 0, 0.27, b.H - 0.38, { color: gold });
      const bays = Math.max(2, Math.round(len / 2.6));
      for (let i = 0; i <= bays; i++) {
        const u = -len / 2 + (i * len) / bays;
        b.box(0.42, 0.14, b.H - 0.35, u, 0.07, 0, { color: cream });
        b.box(0.5, 0.18, 0.2, u, 0.09, b.H - 0.7, { color: gold });
      }
      for (let i = 0; i < bays; i++) {
        const u = -len / 2 + ((i + 0.5) * len) / bays;
        if (side === 'S')
          windowPane(b, u, 2.4, 1.3, 2.6, glass, cream, {
            arch: true,
            curtains: '#6e1018',
            brightness: '#a0a8c0',
          });
        else if (side === 'N') {
          picture(b, u, 2.5, 1.2, 2.2, b.texMat(b.tex(64, 128, art.fleck('#5a6670', rng, 200))), gold, true);
          b.box(1.6, 0.6, 0.42, u, 0.4, 0, { color: '#3a1a10' });
          b.box(1.6, 0.16, 0.5, u, 0.1, 0.42, { color: '#3a1a10' });
          if (rng.next() < 0.5 * o.detail) seated(b, u, 0.42, 0.42, HALF, true);
        } else if (i === Math.floor(bays / 2)) {
          picture(b, u, 2.7, 1.3, 1.8, b.texMat(b.tex(128, 180, art.portrait(rng))), gold);
        } else picture(b, u, 2.5, 0.9, 0.7, b.texMat(b.tex(128, 96, art.portrait(rng))), gold);
        if (side !== 'S') b.lamp(u, 1.0, 2.6, '#ffe2b0', 0.25, 1.4);
      }
    });
  // Freestanding columns towards the corners.
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const x = sx * (t.hx + 3.3);
      const y = sy * (t.hy + 3.0);
      b.box(0.8, 0.8, 0.4, x, y, 0, { color: cream });
      b.cyl(0.3, 0.32, b.H - 1.0, x, y, 0.4, { color: '#e8dfc8' }, 16);
      b.box(0.8, 0.8, 0.3, x, y, b.H - 0.6, { color: gold });
    }
  for (const sx of [-1, 1]) chandelier(b, sx * (t.hx + 2.0), 0, b.H - 1.9, 1.1, 1.3);
  if (o.detail > 0.6)
    for (const s of [-1, 1])
      chairs(b, s < 0 ? 'S' : 'N', {
        dist: t.hy + 2.6,
        len: 2 * t.hx,
        rows: 1,
        color: '#6e1018',
        fill: 0.6,
        formal: true,
      });
  tableLamp(b, 'canopy', { frame: '#2a1a0a', warm: '#fff0d6' });
  return { b, mood: { bg: '#0d0a06', fog: [12, 30], hemi: 0.22, light: '#fff0d6', power: 2.6 } };
};

// -----------------------------------------------------------------------------------------------
// The manor house: an invitational in the library.

const manor: Make = (t, o) => {
  const rng = new Rng(o.seed);
  const X = Math.max(6.4, t.hx + 4.4);
  const Y = Math.max(5.6, t.hy + 4.9);
  const b = new RoomBuilder(X, Y, 3.9, t, rng, o.detail);
  b.ambient.setRGB(0.09, 0.07, 0.05);
  const floor = b.texMat(b.tile(b.tex(256, 256, art.planks('#3b2414', rng, 6)), 1.4));
  const oak = b.texMat(b.tile(b.tex(256, 256, art.panelling('#3f2614', 2)), 1.2, 2.3));
  const paper = b.texMat(b.tile(b.tex(128, 128, art.wallpaper('#3a1d1d', '#4a2626', true)), 0.7));
  shell(b, { floor, low: oak, high: paper, dado: 2.3, trim: '#24140a', ceiling: '#d8cdb4' });
  for (const side of ['N', 'S', 'E', 'W'] as const)
    b.onWall(side, (len) => b.box(len, 0.2, 0.25, 0, 0.1, b.H - 0.25, { color: '#e0d4b8' }));
  // The rug.
  const rug = b.texMat(b.tile(b.tex(256, 256, art.carpet('#5a1618', '#c49a4a', '#1d2b4a', rng, 1)), 1.1));
  b.flat(2 * t.hx + 3.2, 2 * t.hy + 3.0, 0, 0, 0.006, { mat: rug });
  b.flat(2 * t.hx + 3.4, 2 * t.hy + 3.2, 0, 0, 0.005, { color: '#2a1a3a' });
  const gold = '#b8913e';
  b.onWall('N', (len) => {
    const w = len - 1.6;
    b.box(w, 0.4, 3.0, 0, 0.2, 0, { color: '#2e1a0c' });
    b.panel(w - 0.2, 2.7, 0, 0.405, 1.55, HALF, {
      mat: b.texMat(b.tile(b.tex(512, 512, art.books(rng)), 2.0, 2.7)),
    });
    b.box(w + 0.1, 0.45, 0.12, 0, 0.22, 3.0, { color: '#2e1a0c' });
    for (let i = 0; i < 3; i++) b.lamp(-w / 3 + (i * w) / 3, 1.0, 2.6, '#ffd9a0', 0.25, 1.5);
  });
  b.onWall('E', (len) => {
    b.box(2.2, 0.5, b.H, 0, 0.25, 0, { color: '#5a4a3a' });
    b.box(1.9, 0.22, 1.3, 0, 0.6, 0, { color: '#a89a84' });
    b.panel(0.9, 0.8, 0, 0.715, 0.45, HALF, { color: '#080605' });
    b.panel(0.7, 0.4, 0, 0.72, 0.22, HALF, { mat: b.texMat(b.tex(128, 80, art.fire(rng))), glow: true });
    b.box(2.1, 0.34, 0.1, 0, 0.62, 1.3, { color: '#a89a84' });
    picture(b, 0, 2.35, 0.95, 1.2, b.texMat(b.tex(128, 170, art.portrait(rng))), gold);
    for (const s of [-1, 1]) {
      b.cyl(0.03, 0.04, 0.3, s * 0.8, 0.62, 1.4, { color: gold }, 8);
      b.ball(0.03, s * 0.8, 0.62, 1.73, { color: '#ffd890', glow: true }, 6);
    }
    b.lamp(0, 1.2, 0.4, '#ff7a20', 0.9, 1.8);
    picture(b, -len * 0.33, 1.7, 0.7, 0.9, b.texMat(b.tex(128, 170, art.portrait(rng))), gold);
    picture(b, len * 0.33, 1.7, 0.7, 0.9, b.texMat(b.tex(128, 170, art.portrait(rng))), gold);
  });
  b.onWall('W', (len) => {
    for (const s of [-1, 1])
      picture(b, s * len * 0.25, 2.0, 1.0, 1.3, b.texMat(b.tex(128, 170, art.portrait(rng))), gold);
    // A long-case clock.
    b.box(0.5, 0.35, 2.1, 0, 0.18, 0, { color: '#2a160a' });
    b.disc(0.17, 0, 0.36, 1.8, HALF, { color: '#efe6d0' }, 20);
    for (const s of [-1, 1]) sconce(b, s * len * 0.42, 2.0, '#ffd9a0', 0.3);
  });
  b.onWall('S', (len) => {
    const glass = b.texMat(b.tex(128, 256, art.nightWindow(2, 4, '#0b1830', '#15233a')));
    const n = Math.max(2, Math.floor(len / 3.2));
    for (let i = 0; i < n; i++)
      windowPane(b, -len / 2 + ((i + 0.5) * len) / n, 1.9, 1.2, 2.3, glass, '#e0d4b8', {
        curtains: '#24361f',
        brightness: '#8890a0',
      });
  });
  // Chesterfields at the ends, lamps beside them, and the guests.
  for (const s of [-1, 1]) {
    const x = s * (t.hx + 2.7);
    const rot = s < 0 ? 0 : PI;
    b.push(x, 0, rot);
    b.box(0.9, 2.0, 0.42, 0, 0, 0, { color: '#4a1410' });
    b.box(0.22, 2.0, 0.42, -0.34, 0, 0.42, { color: '#4a1410' });
    for (const e of [-1, 1]) b.box(0.9, 0.2, 0.25, 0, e * 0.9, 0.42, { color: '#4a1410' });
    b.box(0.5, 0.5, 0.6, 0, 1.4, 0, { color: '#2a160a' });
    b.cyl(0.03, 0.08, 0.35, 0, 1.4, 0.6, { color: gold }, 8);
    b.cyl(0.1, 0.18, 0.22, 0, 1.4, 0.95, { color: '#f3dca8', glow: true }, 12);
    b.lamp(0, 1.4, 1.1, '#ffd9a0', 0.4, 1.4);
    for (let k = 0; k < 2; k++)
      if (rng.next() < 0.7 * o.detail) seated(b, -0.05, -0.45 + k * 0.9, 0.42, 0, true);
    b.pop();
  }
  chairs(b, 'N', { dist: t.hy + 2.5, len: 2 * t.hx + 1, rows: 2, color: '#c9a050', fill: 0.8, formal: true });
  for (const s of [-1, 1]) chandelier(b, s * (t.hx + 1.7), -0.6, b.H - 1.25, 0.8, 0.9);
  tableLamp(b, 'canopy', { frame: '#2e1a0c', warm: '#ffeccc' });
  return { b, mood: { bg: '#0b0704', fog: [10, 24], hemi: 0.18, light: '#ffe7c2', power: 2.5 } };
};

// -----------------------------------------------------------------------------------------------
// The exhibition centre: black drapes, two stands, the tour's backdrop.

const exhibition: Make = (t, o) => {
  const rng = new Rng(o.seed);
  const rows = 6;
  const depth = 0.8;
  const X = Math.max(9, t.hx + 7.5);
  const Y = Math.max(8.5, t.hy + 3.0 + rows * depth + 0.9);
  const b = new RoomBuilder(X, Y, 8, t, rng, o.detail);
  b.ambient.setRGB(0.05, 0.05, 0.06);
  b.shadow = 0.8;
  const concrete = b.texMat(b.tile(b.tex(128, 128, art.fleck('#2a2a2c', rng, 2500)), 2));
  const drapes = b.texMat(b.tile(b.tex(128, 64, art.drape('#141418')), 1.2, b.H));
  shell(b, { floor: concrete, high: drapes, ceiling: '#08080a' });
  b.flat(2 * t.hx + 4.6, 2 * t.hy + 4.0, 0, 0, 0.005, {
    mat: b.texMat(b.tile(b.tex(128, 128, art.fleck('#1b2f5a', rng, 2500)), 1)),
  });
  for (let x = -X + 1.5; x < X; x += 3)
    b.box(0.3, 2 * Y, 0.3, x, 0, b.H - 0.6, { color: '#202024', hang: true });
  const title = o.event ?? o.name ?? 'Exhibition Centre';
  for (const side of ['N', 'S'] as const)
    stand(b, side, {
      dist: t.hy + 3.0,
      len: 2 * t.hx + 5,
      rows,
      rise: 0.36,
      depth,
      base: 0.3,
      seat: '#1c3d8a',
      step: '#1a1a1e',
      fill: 0.7,
      fascia: { h: 0.7, mat: b.texMat(b.tex(512, 64, art.ledBoard(rng, 220))) },
    });
  b.onWall('E', () => {
    b.box(7, 1.2, 0.5, 0, 0.6, 0, { color: '#111' });
    b.panel(6.4, 3.0, 0, 0.05, 3.4, HALF, {
      mat: b.texMat(b.tex(640, 300, art.screen(title, o.event ? (o.name ?? '') : 'Live', 220))),
      glow: true,
    });
    b.lamp(0, 2.5, 2.4, '#4a8aff', 0.6, 3.5);
  });
  b.onWall('W', () => {
    for (const s of [-1, 1]) b.box(0.15, 0.15, 3.6, s * 1.7, 1.2, 0, { color: '#2a2a2e' });
    b.panel(3.2, 1.8, 0, 1.3, 3.0, HALF, {
      mat: b.texMat(b.tex(512, 288, art.scoreboard(title, rng))),
      glow: true,
    });
    b.lamp(0, 3, 3, '#6aa0ff', 0.4, 3);
  });
  // Boards round the arena floor.
  const led = b.texMat(b.tex(512, 64, art.ledBoard(rng, 210)));
  for (const s of [-1, 1]) {
    b.panel(2 * t.hy + 3.6, 0.55, s * (t.hx + 2.5), 0, 0.28, s < 0 ? 0 : PI, {
      mat: led,
      glow: true,
      color: '#c8c8c8',
    });
  }
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    b.lamp(sx * (X - 1), sy * (Y - 1), 0.5, '#3050ff', 0.8, 3);
  tableLamp(b, 'rig');
  return { b, mood: { bg: '#040406', fog: [14, 34], hemi: 0.08, light: '#ffffff', power: 3.2 } };
};

// -----------------------------------------------------------------------------------------------
// The theatre: steep seats close round three sides, the players' entrance on the fourth.

const theatre: Make = (t, o) => {
  const rng = new Rng(o.seed);
  const rows = 8;
  const depth = 0.8;
  const rise = 0.42;
  const dy = t.hy + 2.6;
  const dx = t.hx + 2.9;
  const X = dx + rows * depth + 0.6;
  const Y = dy + rows * depth + 0.6;
  const b = new RoomBuilder(X, Y, 9, t, rng, o.detail);
  b.ambient.setRGB(0.035, 0.035, 0.045);
  b.shadow = 0.85;
  shell(b, { floor: '#0a0a0c', high: '#08080a', ceiling: '#050506' });
  b.flat(2 * dx, 2 * dy, 0, 0, 0.005, {
    mat: b.texMat(b.tile(b.tex(128, 128, art.fleck('#1a2a52', rng, 2500)), 1)),
  });
  const seat = '#1f4d5a';
  const wood = '#2e1a0e';
  const top = stand(b, 'N', {
    dist: dy,
    len: 2 * dx,
    rows,
    rise,
    depth,
    base: 0.9,
    seat,
    step: '#141416',
    fill: 0.92,
    fascia: { h: 1.0, color: wood },
  });
  stand(b, 'S', {
    dist: dy,
    len: 2 * dx,
    rows,
    rise,
    depth,
    base: 0.9,
    seat,
    step: '#141416',
    fill: 0.92,
    fascia: { h: 1.0, color: wood },
  });
  stand(b, 'W', {
    dist: dx,
    len: 2 * dy,
    rows,
    rise,
    depth,
    base: 0.9,
    seat,
    step: '#141416',
    fill: 0.92,
    fascia: { h: 1.0, color: wood },
  });
  // Fill the corners.
  for (const sy of [-1, 1])
    b.box(X - dx + 0.2, Y - dy, top + 1, -(dx + X) / 2, (sy * (dy + Y)) / 2, 0, { color: '#0c0c0e' });
  // The east end: curtains, the way in and the scoreboard above.
  const title = o.event ?? o.name ?? 'The Forge Theatre';
  b.onWall('E', (len) => {
    b.panel(len, 6, 0, 0.3, 3, HALF, { mat: b.texMat(b.tile(b.tex(128, 64, art.drape('#1a1f3a')), 1.0, 6)) });
    b.box(2.6, 0.4, 2.6, 0, 0.3, 0, { color: '#050505' });
    b.panel(2.4, 2.4, 0, 0.51, 1.2, HALF, { color: '#020202' });
    b.box(2.9, 0.42, 0.16, 0, 0.3, 2.6, { color: wood });
    b.panel(4.2, 1.6, 0, 0.6, 4.4, HALF, {
      mat: b.texMat(b.tex(512, 200, art.scoreboard(title, rng, '#2a6a8a'))),
      glow: true,
    });
    b.box(4.4, 0.2, 1.8, 0, 0.45, 3.5, { color: '#111' });
    b.lamp(0, 2, 4, '#7ab0ff', 0.3, 3);
  });
  for (const [x, y] of [
    [0, Y - 1],
    [0, -Y + 1],
    [-X + 1, 0],
  ] as const)
    b.lamp(x, y, top + 2, '#ffe8c8', 0.35, 3.5);
  tableLamp(b, 'rig');
  return { b, mood: { bg: '#020203', fog: [12, 28], hemi: 0.06, light: '#ffffff', power: 3.3 } };
};

// -----------------------------------------------------------------------------------------------
// The palace: a Victorian great hall under a glass and iron vault.

const palace: Make = (t, o) => {
  const rng = new Rng(o.seed);
  const rows = 10;
  const depth = 0.85;
  const dy = t.hy + 3.0;
  const dx = t.hx + 3.4;
  const X = dx + 9 * depth + 3.2;
  const Y = dy + rows * depth + 0.8;
  const spring = 9;
  const b = new RoomBuilder(X, Y, spring + Y, t, rng, o.detail);
  b.ambient.setRGB(0.045, 0.04, 0.06);
  b.shadow = 0.85;
  const bricks = b.texMat(b.tile(b.tex(256, 256, art.brick('#7a4a32', '#4a3528', rng)), 1.0, 0.6));
  b.flat(2 * X, 2 * Y, 0, 0, 0.002, {
    mat: b.texMat(b.tile(b.tex(256, 256, art.planks('#2a1c12', rng, 8)), 1.4)),
  });
  b.flat(2 * dx, 2 * dy, 0, 0, 0.005, {
    mat: b.texMat(b.tile(b.tex(128, 128, art.fleck('#14204a', rng, 2500)), 1)),
  });
  for (const side of ['N', 'S'] as const)
    b.onWall(side, (len) => {
      b.panel(len, spring, 0, 0, spring / 2, HALF, { mat: bricks });
      for (let u = -len / 2 + 3; u < len / 2 - 2; u += 4) {
        b.panel(1.6, 3.4, u, 0.02, spring - 2.6, HALF, { color: '#2a1850', glow: true });
        b.arch(0.8, u, 0.02, spring - 0.9, HALF, { color: '#2a1850', glow: true });
      }
    });
  for (const side of ['E', 'W'] as const)
    b.onWall(side, (len) => {
      b.panel(len, spring, 0, 0, spring / 2, HALF, { mat: bricks });
      b.arch(len / 2, 0, 0, spring, HALF, { mat: bricks });
    });
  b.onWall('E', () =>
    b.disc(
      3.4,
      0,
      0.05,
      spring + 3.0,
      HALF,
      { mat: b.texMat(b.tex(512, 512, art.rose(rng))), glow: true, color: '#d8d0e8' },
      40,
    ),
  );
  vault(b, spring, 16, { iron: '#3a3a48', glass: '#141a38', ribs: '#2a2a32', ribEvery: 4 });
  // Up-lights washing the brick in colour.
  for (const side of [-1, 1])
    for (let x = -X + 3; x < X; x += 4)
      b.lamp(x, side * (Y - 0.6), 1.5, side < 0 ? '#6a3aff' : '#3a6aff', 1.0, 4.5);
  for (const side of [-1, 1]) b.lamp(side * (X - 0.6), 0, 2, '#7a4aff', 1.4, 6);
  const fascia = b.texMat(b.tex(512, 64, art.ledBoard(rng, 260)));
  for (const side of ['N', 'S'] as const)
    stand(b, side, {
      dist: dy,
      len: 2 * dx,
      rows,
      rise: 0.42,
      depth,
      base: 0.6,
      seat: '#2a1a5a',
      step: '#141418',
      fill: 0.85,
      fascia: { h: 0.8, mat: fascia },
    });
  stand(b, 'W', {
    dist: dx,
    len: 2 * dy,
    rows: 9,
    rise: 0.42,
    depth,
    base: 0.6,
    seat: '#2a1a5a',
    step: '#141418',
    fill: 0.85,
    fascia: { h: 0.8, mat: fascia },
  });
  for (const sy of [-1, 1])
    b.box(X - dx, Y - dy, 0.6 + rows * 0.42 + 1, -(dx + X) / 2, (sy * (dy + Y)) / 2, 0, { color: '#0c0c10' });
  // The east end: a stage with the screen and the walk-on arch.
  const title = o.event ?? o.name ?? 'Kingsmere Palace';
  b.onWall('E', (len) => {
    b.box(Math.min(len - 2, 14), 2.6, 0.9, 0, 1.3, 0, { color: '#101014' });
    b.panel(8, 4, 0, 0.3, 5.0, HALF, {
      mat: b.texMat(b.tex(800, 400, art.screen(title, o.event ? (o.name ?? '') : 'Live', 260))),
      glow: true,
    });
    for (const s of [-1, 1]) {
      b.box(0.12, 0.12, 3.2, s * 1.6, 2.4, 0.9, { color: '#9a7aff', glow: true });
      b.lamp(s * 1.6, 2.8, 2, '#9a7aff', 0.8, 2.5);
    }
    b.box(3.32, 0.12, 0.12, 0, 2.4, 4.1, { color: '#9a7aff', glow: true });
  });
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) chandelier(b, sx * (dx + 1.5), sy * (dy - 1), 10, 2.2, 1.2);
  tableLamp(b, 'rig');
  return { b, mood: { bg: '#05040a', fog: [18, 56], hemi: 0.08, light: '#ffffff', power: 3.3 } };
};

// -----------------------------------------------------------------------------------------------
// The arena: a full bowl, the screens, the walk-on.

const arena: Make = (t, o) => {
  const rng = new Rng(o.seed);
  const rows = 12;
  const depth = 0.85;
  const rise = 0.45;
  const dy = t.hy + 3.2;
  const dx = t.hx + 3.6;
  const X = dx + rows * depth + 0.8;
  const Y = dy + rows * depth + 0.8;
  const b = new RoomBuilder(X, Y, 18, t, rng, o.detail);
  b.ambient.setRGB(0.04, 0.04, 0.05);
  b.shadow = 0.85;
  shell(b, { floor: '#0b0b0e', high: '#060608', ceiling: '#040405' });
  b.flat(2 * dx, 2 * dy, 0, 0, 0.005, {
    mat: b.texMat(b.tile(b.tex(128, 128, art.fleck('#0f2a66', rng, 2500)), 1)),
  });
  const ribbon = b.texMat(b.tex(512, 64, art.ledBoard(rng, 0)));
  const title = o.event ?? o.name ?? 'Northgate Arena';
  const common = {
    rows,
    rise,
    depth,
    base: 0.7,
    seat: '#8a1a22',
    step: '#121216',
    fill: 0.88,
    fascia: { h: 0.9, mat: ribbon },
  };
  const topZ = stand(b, 'N', { ...common, dist: dy, len: 2 * dx });
  stand(b, 'S', { ...common, dist: dy, len: 2 * dx });
  stand(b, 'W', { ...common, dist: dx, len: 2 * dy });
  stand(b, 'E', { ...common, dist: dx, len: 2 * dy, gap: 3.2 });
  // A ribbon of light round the top of the bowl.
  for (const side of ['N', 'S', 'E', 'W'] as const)
    b.onWall(side, (len) =>
      b.panel(len, 0.8, 0, 0.02, topZ + 1.0, HALF, { mat: ribbon, glow: true, color: '#d0d0d0' }),
    );
  // The walk-on: a lit tunnel through the east stand.
  b.facing('E', dx, () => {
    b.box(3.2, rows * depth, 0.25, 0, (rows * depth) / 2, 2.8, { color: '#0a0a0c' });
    for (const s of [-1, 1]) b.box(0.08, 0.08, 2.8, s * 1.55, 0.04, 0, { color: '#6a8cff', glow: true });
    b.box(3.18, 0.08, 0.08, 0, 0.04, 2.8, { color: '#6a8cff', glow: true });
    b.panel(3.0, 2.8, 0, rows * depth - 0.1, 1.4, -HALF, { color: '#141c40', glow: true });
    b.lamp(0, 1, 1.5, '#8ab0ff', 0.9, 3);
  });
  // The centre-hung screens.
  const hz = 11;
  b.box(5.2, 3.2, 2.6, 0, 0, hz, { color: '#0a0a0c', hang: true });
  const sb = b.texMat(b.tex(512, 288, art.scoreboard(title, rng, '#d0202a')));
  b.panel(4.8, 2.3, 0, 1.61, hz + 1.3, HALF, { mat: sb, glow: true, hang: true });
  b.panel(4.8, 2.3, 0, -1.61, hz + 1.3, -HALF, { mat: sb, glow: true, hang: true });
  b.panel(2.9, 2.3, 2.61, 0, hz + 1.3, 0, { mat: sb, glow: true, hang: true });
  b.panel(2.9, 2.3, -2.61, 0, hz + 1.3, PI, { mat: sb, glow: true, hang: true });
  b.cyl(0.05, 0.05, b.H - hz - 2.6, 0, 0, hz + 2.6, { color: '#222', hang: true }, 6);
  // Catwalks.
  for (let x = -X + 3; x < X; x += 5)
    b.box(0.6, 2 * Y, 0.3, x, 0, b.H - 2.5, { color: '#18181c', hang: true });
  // House lights, low.
  for (const [x, y] of [
    [0, Y - 3],
    [0, -Y + 3],
    [X - 3, 0],
    [-X + 3, 0],
  ] as const)
    b.lamp(x, y, topZ + 3, '#ffe8d0', 0.45, 5);
  for (const s of [-1, 1]) b.lamp(0, s * (dy + 0.5), 0.6, '#ff3040', 0.6, 2.5);
  tableLamp(b, 'rig');
  return { b, mood: { bg: '#020204', fog: [20, 60], hemi: 0.06, light: '#ffffff', power: 3.4 } };
};

const MAKERS: Record<RoomId, Make> = {
  pub,
  club,
  social,
  cafe,
  sportshall,
  neva,
  manor,
  exhibition,
  theatre,
  palace,
  arena,
};
