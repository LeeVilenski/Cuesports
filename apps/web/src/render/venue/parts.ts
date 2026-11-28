import { Vector3, type ColorRepresentation, type MeshBasicMaterial } from 'three';
import type { RoomBuilder, Side } from './builder';

/** Pieces several rooms share: the shell, people, seating, table lamps, other tables, frames. */

const CLOTHES = [
  '#1d1f24',
  '#2b2e36',
  '#3a3f4a',
  '#4a2a2a',
  '#23324a',
  '#5a5a5a',
  '#7a1f1f',
  '#1f4a7a',
  '#8a7a5a',
  '#2a4a2a',
  '#d8d2c4',
  '#6a4a8a',
  '#a8452a',
  '#151515',
  '#c9b48a',
];
const FORMAL = ['#111111', '#16181d', '#1c1c24', '#2a1e1e', '#e9e4da', '#3a1020', '#12223a'];
const SKIN = ['#f1c9a5', '#e0ac7e', '#c68a5c', '#8d5a3b', '#5c3a24', '#f5d7bd'];
const HAIR = ['#1a120c', '#3a2414', '#6b4a2a', '#a8a29a', '#c9a060', '#222222'];

const pick = <T>(b: RoomBuilder, xs: T[]): T => xs[b.rng.int(xs.length)]!;

export interface ShellOpts {
  floor?: MeshBasicMaterial | ColorRepresentation;
  /** Lower wall (up to `dado`), upper wall. */
  low?: MeshBasicMaterial | ColorRepresentation;
  high: MeshBasicMaterial | ColorRepresentation;
  dado?: number;
  /** Dado rail and skirting colour. */
  trim?: ColorRepresentation;
  ceiling?: MeshBasicMaterial | ColorRepresentation;
  /** Which walls to build (all by default). */
  walls?: Side[];
}

const asOpts = (m: MeshBasicMaterial | ColorRepresentation) =>
  typeof m === 'object' && m !== null && 'isMaterial' in m ? { mat: m } : { color: m as ColorRepresentation };

/** Floor, four walls (with a dado and skirting) and a ceiling. */
export function shell(b: RoomBuilder, o: ShellOpts): void {
  if (o.floor !== undefined) b.flat(2 * b.X, 2 * b.Y, 0, 0, 0.002, asOpts(o.floor));
  const dado = o.low ? (o.dado ?? 1) : 0;
  for (const side of o.walls ?? (['N', 'S', 'E', 'W'] as Side[])) {
    b.onWall(side, (len) => {
      if (o.low) b.panel(len, dado, 0, 0, dado / 2, Math.PI / 2, asOpts(o.low));
      b.panel(len, b.H - dado, 0, 0, dado + (b.H - dado) / 2, Math.PI / 2, asOpts(o.high));
      if (o.trim) {
        b.box(len, 0.03, 0.12, 0, 0.015, 0, { color: o.trim });
        if (o.low) b.box(len, 0.04, 0.05, 0, 0.02, dado - 0.025, { color: o.trim });
      }
    });
  }
  if (o.ceiling) b.flat(2 * b.X, 2 * b.Y, 0, 0, b.H, asOpts(o.ceiling), true);
}

/** A seated spectator at (x, y) on a seat at height z, facing `rot`. */
export function seated(b: RoomBuilder, x: number, y: number, z: number, rot: number, formal = false): void {
  const fx = Math.cos(rot);
  const fy = Math.sin(rot);
  const top = pick(b, formal ? FORMAL : CLOTHES);
  const lean = b.rng.range(-0.03, 0.03);
  b.box(0.26, 0.42, 0.55, x - fx * 0.08 + lean, y - fy * 0.08, z, { color: top, rot });
  b.box(0.36, 0.38, 0.13, x + fx * 0.14, y + fy * 0.14, z, { color: pick(b, CLOTHES.slice(0, 6)), rot });
  const hx = x - fx * 0.06 + lean;
  const hy = y - fy * 0.06;
  b.box(0.2, 0.17, 0.22, hx, hy, z + 0.58, { color: pick(b, SKIN), rot });
  b.box(0.21, 0.18, 0.07, hx - fx * 0.01, hy - fy * 0.01, z + 0.75, { color: pick(b, HAIR), rot });
}

/** A standing figure at (x, y), facing `rot`. */
export function standing(b: RoomBuilder, x: number, y: number, rot: number, formal = false): void {
  b.box(0.22, 0.36, 0.84, x, y, 0, { color: pick(b, ['#1d1f24', '#2b2e36', '#23324a', '#3a3a3a']), rot });
  b.box(0.26, 0.44, 0.6, x, y, 0.84, { color: pick(b, formal ? FORMAL : CLOTHES), rot });
  b.box(0.2, 0.17, 0.23, x, y, 1.46, { color: pick(b, SKIN), rot });
  b.box(0.21, 0.18, 0.07, x, y, 1.66, { color: pick(b, HAIR), rot });
}

export interface StandOpts {
  /** Distance of the front row from the table's centre line. */
  dist: number;
  len: number;
  rows: number;
  rise: number;
  depth: number;
  /** Height of the front row. */
  base: number;
  seat: ColorRepresentation;
  step: ColorRepresentation;
  /** Share of seats taken. */
  fill: number;
  /** A gap in the middle (a walk-on tunnel), metres. */
  gap?: number;
  /** A solid front wall this high, in front of the first row. */
  fascia?: { h: number; color?: ColorRepresentation; mat?: MeshBasicMaterial };
  formal?: boolean;
}

/** Tiered seating facing the table from one side. Returns the height of the back row. */
export function stand(b: RoomBuilder, side: Side, o: StandOpts): number {
  const gap = o.gap ?? 0;
  const spans: [number, number][] = gap
    ? [
        [-o.len / 2, -gap / 2],
        [gap / 2, o.len / 2],
      ]
    : [[-o.len / 2, o.len / 2]];
  b.facing(side, o.dist, () => {
    for (let r = 0; r < o.rows; r++) {
      const z = o.base + r * o.rise;
      const y0 = r * o.depth;
      for (const [a, c] of spans) {
        const w = c - a;
        b.box(w, o.depth, z, (a + c) / 2, y0 + o.depth / 2, 0, { color: o.step });
        // Seat cushions in one strip; backs per seat when there's detail to spare.
        b.box(w, 0.42, 0.42, (a + c) / 2, y0 + o.depth * 0.55, z, { color: o.seat });
        const n = Math.floor(w / 0.55);
        for (let i = 0; i < n; i++) {
          const x = a + (i + 0.5) * (w / n);
          if (b.detail > 0.6)
            b.box(0.46, 0.06, 0.38, x, y0 + o.depth * 0.55 + 0.2, z + 0.42, { color: o.seat });
          if (b.rng.next() < o.fill * (0.6 + 0.4 * b.detail))
            seated(b, x, y0 + o.depth * 0.5, z + 0.42, -Math.PI / 2, o.formal);
        }
      }
    }
    if (o.fascia) {
      for (const [a, c] of spans)
        b.box(
          c - a,
          0.08,
          o.fascia.h,
          (a + c) / 2,
          -0.04,
          0,
          o.fascia.mat
            ? { mat: o.fascia.mat, glow: true, color: '#c8c8c8' }
            : { color: o.fascia.color ?? o.step },
        );
    }
    // Back wall behind the top row.
    const backH = o.base + o.rows * o.rise + 1.2;
    for (const [a, c] of spans)
      b.box(c - a, 0.1, backH, (a + c) / 2, o.rows * o.depth + 0.05, 0, { color: o.step });
  });
  return o.base + o.rows * o.rise;
}

/** Rows of loose chairs facing the table from one side. */
export function chairs(
  b: RoomBuilder,
  side: Side,
  o: {
    dist: number;
    len: number;
    rows: number;
    color: ColorRepresentation;
    fill: number;
    formal?: boolean;
    gap?: number;
  },
): void {
  b.facing(side, o.dist, () => {
    for (let r = 0; r < o.rows; r++) {
      const y = r * 0.95;
      const n = Math.floor(o.len / 0.6);
      for (let i = 0; i < n; i++) {
        const x = -o.len / 2 + (i + 0.5) * (o.len / n);
        if (o.gap && Math.abs(x) < o.gap / 2) continue;
        b.box(0.44, 0.42, 0.04, x, y, 0.44, { color: o.color });
        b.box(0.44, 0.04, 0.42, x, y + 0.2, 0.46, { color: o.color });
        b.box(0.4, 0.03, 0.44, x, y - 0.18, 0, { color: '#222' });
        b.box(0.4, 0.03, 0.44, x, y + 0.18, 0, { color: '#222' });
        if (b.rng.next() < o.fill * (0.6 + 0.4 * b.detail)) seated(b, x, y, 0.46, -Math.PI / 2, o.formal);
      }
    }
  });
}

export type LampStyle = 'shades' | 'canopy' | 'rig';

/** The light over the table: a row of shades, a long canopy, or a canopy under a lighting truss. */
export function tableLamp(
  b: RoomBuilder,
  style: LampStyle,
  o: { shade?: ColorRepresentation; frame?: ColorRepresentation; warm?: ColorRepresentation } = {},
): void {
  const { hx: A, hy: B, top } = b.table;
  const z = top + 1.05;
  const warm = o.warm ?? '#fff1d6';
  const frame = o.frame ?? '#1a1a1a';
  const hangTo = (x: number, y: number, from: number) => {
    const len = Math.min(b.H - from, 2.5);
    if (len > 0.05) b.cyl(0.008, 0.008, len, x, y, from, { color: '#222', hang: true }, 4);
  };
  if (style === 'shades') {
    const n = A > 1.6 ? 3 : 2;
    const span = 2 * A * 0.62;
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + (i * span) / (n - 1);
      b.cyl(0.08, 0.26, 0.22, x, 0, z, { color: o.shade ?? '#1f5a32', hang: true }, 16);
      b.cyl(0.245, 0.245, 0.004, x, 0, z - 0.001, { color: warm, glow: true, hang: true }, 16);
      b.lamp(x, 0, z - 0.1, warm, 0.9, 1.7);
    }
    b.rod(0.014, span + 0.2, 0, 0, z + 0.25, { color: frame, hang: true });
    hangTo(-span / 2, 0, z + 0.25);
    hangTo(span / 2, 0, z + 0.25);
    return;
  }
  const w = 2 * A * 0.92;
  const d = 2 * B * 0.86;
  b.box(w, d, 0.2, 0, 0, z, { color: frame, hang: true });
  b.flat(w - 0.12, d - 0.12, 0, 0, z - 0.002, { color: warm, glow: true, hang: true }, true);
  for (const s of [-1, 1]) b.lamp((s * w) / 3, 0, z - 0.1, warm, 1.0, 1.9);
  if (style === 'canopy') {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) hangTo((sx * w) / 2.4, (sy * d) / 2.4, z + 0.2);
    return;
  }
  // A truss above, its lamps pointing in.
  const tz = z + 1.6;
  const tw = w + 2.4;
  const td = d + 2.4;
  const truss = { color: '#3a3a40', hang: true };
  b.box(tw, 0.28, 0.28, 0, td / 2, tz, truss);
  b.box(tw, 0.28, 0.28, 0, -td / 2, tz, truss);
  b.box(0.28, td, 0.28, tw / 2, 0, tz, truss);
  b.box(0.28, td, 0.28, -tw / 2, 0, tz, truss);
  for (let i = 0; i < 6; i++) {
    const x = -tw / 2 + 0.6 + (i * (tw - 1.2)) / 5;
    for (const s of [-1, 1]) {
      b.box(0.2, 0.2, 0.24, x, (s * td) / 2 - s * 0.25, tz - 0.24, { color: '#111', hang: true });
      b.flat(
        0.15,
        0.15,
        x,
        (s * td) / 2 - s * 0.25,
        tz - 0.242,
        { color: '#fff6e8', glow: true, hang: true },
        true,
      );
    }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) hangTo((sx * tw) / 2, (sy * td) / 2, tz + 0.28);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) hangTo((sx * w) / 2.4, (sy * d) / 2.4, z + 0.2);
}

/** Another table in the room, with its own light (a club's other tables, a hall's second table). */
export function otherTable(
  b: RoomBuilder,
  x: number,
  y: number,
  o: {
    cloth: ColorRepresentation;
    wood: ColorRepresentation;
    lamp?: LampStyle;
    shade?: ColorRepresentation;
    covered?: boolean;
  },
): void {
  const { hx: A, hy: B, top } = b.table;
  b.push(x, y);
  const legs = top - 0.27;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) b.box(0.14, 0.14, legs, sx * (A - 0.25), sy * (B - 0.2), 0, { color: o.wood });
  b.box(2 * A - 0.08, 2 * B - 0.08, 0.22, 0, 0, legs, { color: o.wood });
  if (o.covered) {
    b.box(2 * A, 2 * B, 0.06, 0, 0, top - 0.06, { color: '#2a2a2a' });
  } else {
    b.flat(2 * A - 0.26, 2 * B - 0.26, 0, 0, top - 0.035, { color: o.cloth });
    for (const s of [-1, 1]) {
      b.box(2 * A, 0.13, 0.05, 0, s * (B - 0.065), top - 0.05, { color: o.wood });
      b.box(0.13, 2 * B - 0.26, 0.05, s * (A - 0.065), 0, top - 0.05, { color: o.wood });
      b.box(2 * A - 0.26, 0.05, 0.04, 0, s * (B - 0.155), top - 0.06, { color: o.cloth });
      b.box(0.05, 2 * B - 0.3, 0.04, s * (A - 0.155), 0, top - 0.06, { color: o.cloth });
    }
    for (const px of [-1, 0, 1])
      for (const py of [-1, 1])
        b.cyl(0.055, 0.055, 0.005, px * (A - 0.13), py * (B - 0.13), top - 0.03, { color: '#050505' }, 10);
  }
  b.pop();
  // Its light.
  const z = top + 1.05;
  if ((o.lamp ?? 'shades') === 'shades') {
    const n = A > 1.6 ? 3 : 2;
    const span = 2 * A * 0.62;
    for (let i = 0; i < n; i++) {
      const lx = x - span / 2 + (i * span) / (n - 1);
      b.cyl(0.08, 0.26, 0.22, lx, y, z, { color: o.shade ?? '#1f5a32', hang: true }, 12);
      b.cyl(
        0.245,
        0.245,
        0.004,
        lx,
        y,
        z - 0.001,
        { color: o.covered ? '#555' : '#fff1d6', glow: true, hang: true },
        12,
      );
    }
    b.rod(0.014, span + 0.2, x, y, z + 0.25, { color: '#1a1a1a', hang: true });
  } else {
    b.box(2 * A * 0.92, 2 * B * 0.86, 0.2, x, y, z, { color: '#1a1a1a', hang: true });
    b.flat(
      2 * A * 0.92 - 0.12,
      2 * B * 0.86 - 0.12,
      x,
      y,
      z - 0.002,
      { color: o.covered ? '#555' : '#fff1d6', glow: true, hang: true },
      true,
    );
  }
  if (!o.covered) {
    b.lamp(x - A / 2, y, z - 0.1, '#fff1d6', 0.8, 1.6);
    b.lamp(x + A / 2, y, z - 0.1, '#fff1d6', 0.8, 1.6);
  }
}

/** A framed picture on the current wall frame, centred at (u, z). */
export function picture(
  b: RoomBuilder,
  u: number,
  z: number,
  w: number,
  h: number,
  art: MeshBasicMaterial,
  frame: ColorRepresentation = '#3a2414',
  glow = false,
): void {
  const f = Math.min(w, h) * 0.07 + 0.02;
  b.box(w + 2 * f, 0.05, h + 2 * f, u, 0.025, z - h / 2 - f, { color: frame });
  b.panel(w, h, u, 0.052, z, Math.PI / 2, { mat: art, glow });
}

/** A window on the current wall frame: lit glass, a frame and a sill. Optional arch top. */
export function windowPane(
  b: RoomBuilder,
  u: number,
  z: number,
  w: number,
  h: number,
  glass: MeshBasicMaterial,
  frame: ColorRepresentation,
  o: { arch?: boolean; brightness?: ColorRepresentation; curtains?: ColorRepresentation } = {},
): void {
  const bright = o.brightness ?? '#ffffff';
  b.panel(w, h, u, 0.01, z, Math.PI / 2, { mat: glass, glow: true, color: bright });
  if (o.arch) b.arch(w / 2, u, 0.01, z + h / 2, Math.PI / 2, { mat: glass, glow: true, color: bright });
  b.box(w + 0.16, 0.12, 0.07, u, 0.05, z - h / 2 - 0.07, { color: frame });
  b.box(0.08, 0.06, h, u - w / 2 - 0.04, 0.03, z - h / 2, { color: frame });
  b.box(0.08, 0.06, h, u + w / 2 + 0.04, 0.03, z - h / 2, { color: frame });
  if (!o.arch) b.box(w + 0.16, 0.06, 0.08, u, 0.03, z + h / 2, { color: frame });
  if (o.curtains) {
    const top = z + h / 2 + (o.arch ? w / 2 : 0) + 0.15;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++)
        b.box(0.13, 0.12, top - 0.05, u + s * (w / 2 + 0.05 + k * 0.1), 0.14 + (k % 2) * 0.03, 0.05, {
          color: o.curtains,
        });
    }
    b.box(w + 0.9, 0.18, 0.25, u, 0.12, top, { color: o.curtains });
  }
}

/** A wall light: a bracket and a glowing shade, on the current wall frame. */
export function sconce(
  b: RoomBuilder,
  u: number,
  z: number,
  glow: ColorRepresentation,
  power = 0.35,
  range = 1.4,
): void {
  b.box(0.06, 0.12, 0.06, u, 0.06, z - 0.05, { color: '#6a5020' });
  b.cyl(0.05, 0.09, 0.14, u, 0.16, z, { color: glow, glow: true }, 10);
  b.lamp(u, 0.3, z + 0.05, glow, power, range);
}

/** A chandelier hanging with its lowest point at z. */
export function chandelier(b: RoomBuilder, x: number, y: number, z: number, size = 1, power = 1.2): void {
  const gold = '#b8913e';
  b.ball(0.16 * size, x, y, z + 0.25 * size, { color: '#fff3d8', glow: true, hang: true }, 10);
  b.cyl(0.42 * size, 0.42 * size, 0.04, x, y, z + 0.2 * size, { color: gold, hang: true }, 16);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.ball(
      0.05 * size,
      x + Math.cos(a) * 0.42 * size,
      y + Math.sin(a) * 0.42 * size,
      z + 0.32 * size,
      { color: '#fff6e0', glow: true, hang: true },
      6,
    );
  }
  b.cyl(0.25 * size, 0.25 * size, 0.03, x, y, z + 0.6 * size, { color: gold, hang: true }, 12);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.ball(
      0.04 * size,
      x + Math.cos(a) * 0.25 * size,
      y + Math.sin(a) * 0.25 * size,
      z + 0.68 * size,
      { color: '#fff6e0', glow: true, hang: true },
      6,
    );
  }
  b.ball(0.07 * size, x, y, z, { color: '#e8f0ff', glow: true, hang: true }, 6);
  b.cyl(
    0.012,
    0.012,
    Math.max(0.1, Math.min(b.H - z - 0.6 * size, 4)),
    x,
    y,
    z + 0.6 * size,
    { color: gold, hang: true },
    4,
  );
  b.lamp(x, y, z + 0.3 * size, '#ffe7bf', power, 2.6 * size);
}

/** A ribbed barrel vault over the room, springing from height `spring`, made of strips. */
export function vault(
  b: RoomBuilder,
  spring: number,
  strips: number,
  o: { iron: ColorRepresentation; glass: ColorRepresentation; ribs: ColorRepresentation; ribEvery: number },
): void {
  const R = b.Y;
  const pt = (x: number, a: number) => new Vector3(x, R * Math.cos(a), spring + R * Math.sin(a));
  const split = Math.max(2, Math.round(b.X / 1.5));
  for (let i = 0; i < strips; i++) {
    const a0 = (i / strips) * Math.PI;
    const a1 = ((i + 1) / strips) * Math.PI;
    const glass = i > 1 && i < strips - 2 && i % 2 === 0;
    b.quad(
      pt(-b.X, a0),
      pt(b.X, a0),
      pt(b.X, a1),
      pt(-b.X, a1),
      glass ? { color: o.glass, glow: true, hang: true } : { color: o.iron, hang: true },
      split,
    );
  }
  // Ribs: one arch every few metres, as flat bands just under the vault.
  for (let x = -b.X + o.ribEvery / 2; x < b.X; x += o.ribEvery) {
    for (let i = 0; i < strips; i++) {
      const a0 = (i / strips) * Math.PI;
      const a1 = ((i + 1) / strips) * Math.PI;
      const r = R - 0.25;
      const p = (xx: number, a: number) => new Vector3(xx, r * Math.cos(a), spring + r * Math.sin(a));
      b.quad(p(x - 0.15, a0), p(x + 0.15, a0), p(x + 0.15, a1), p(x - 0.15, a1), {
        color: o.ribs,
        hang: true,
      });
    }
  }
}
