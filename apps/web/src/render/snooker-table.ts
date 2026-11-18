import type { PocketSpec, TableSpec, TableTrim, Vec2 } from '@cuesports/shared';
import {
  BoxGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  type Texture,
  Vector2,
} from 'three';
import { buildSnookerPocket, snookerPocketMaterials, type Vec3 } from './snooker-pocket';

/**
 * A full-size snooker table, after match tables such as the Riley Aristocrat:
 * - 3569 x 1778mm playing area, about 136mm of cushion and rail each side (3.84 x 2.05m overall);
 * - 851–876mm from the floor to the top of the cushion (WPBSA);
 * - a 45mm slate bed, under mahogany rails with rounded edges and a moulding beneath;
 * - a deep panelled frieze, recessed round each pocket so the net and ball rails hang free;
 * - eight turned legs on square blocks, with brass castor cups.
 */
export const SNOOKER_BODY = {
  /** Floor to the top of the cushion. */
  height: 0.865,
  slate: 0.045,
  /** Radius of the rounded outer corners of the rails. */
  cornerRadius: 0.03,
  /** The rail comes down just over the slate's edge, no further. */
  railBottom: -0.047,
  mouldingBottom: -0.047,
  /** How far the frieze is set in from the outside of the rails. */
  friezeInset: 0.19,
  friezeBottom: -0.3,
  /** Recesses in the frieze: square at the corners, and at the middle pockets. */
  // Set back this far, the frieze clears the nets: no recesses needed.
  cornerRecess: 0,
  middleRecessHalfWidth: 0,
  middleRecessDepth: 0,
  /** Centre of a ball on the ball rails under the ring, below the cloth. */
  wellDepth: 0.21,
};

/** The frieze's plan: a rectangle with recesses cut at the corners and the middle of the long sides. */
function friezePlan(hx: number, hy: number, n: number, mw: number, md: number): Vec2[] {
  n = Math.max(0, n);
  mw = Math.max(0, mw);
  md = Math.max(0, md);
  // Without recesses some of these points coincide, which the triangulator mishandles.
  const pts: Vec2[] = [
    { x: -hx + n, y: -hy },
    { x: -mw, y: -hy },
    { x: -mw, y: -hy + md },
    { x: mw, y: -hy + md },
    { x: mw, y: -hy },
    { x: hx - n, y: -hy },
    { x: hx - n, y: -hy + n },
    { x: hx, y: -hy + n },
    { x: hx, y: hy - n },
    { x: hx - n, y: hy - n },
    { x: hx - n, y: hy },
    { x: mw, y: hy },
    { x: mw, y: hy - md },
    { x: -mw, y: hy - md },
    { x: -mw, y: hy },
    { x: -hx + n, y: hy },
    { x: -hx + n, y: hy - n },
    { x: -hx, y: hy - n },
    { x: -hx, y: -hy + n },
    { x: -hx + n, y: -hy + n },
  ];
  return pts.filter((p, i) => {
    const q = pts[(i + pts.length - 1) % pts.length]!;
    return Math.hypot(p.x - q.x, p.y - q.y) > 1e-6;
  });
}

function roundedRect(hx: number, hy: number, r: number): Shape {
  const s = new Shape();
  s.moveTo(-hx + r, -hy);
  s.lineTo(hx - r, -hy);
  s.absarc(hx - r, -hy + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hx, hy - r);
  s.absarc(hx - r, hy - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hx + r, hy);
  s.absarc(-hx + r, hy - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hx, -hy + r);
  s.absarc(-hx + r, -hy + r, r, Math.PI, 1.5 * Math.PI, false);
  return s;
}

const toShape = (pts: readonly Vec2[]): Shape => new Shape(pts.map((p) => new Vector2(p.x, p.y)));

/** A solid from a plan, between two heights, with its top and bottom edges rounded by `round`. */
function slab(shape: Shape, z0: number, z1: number, round: number, mat: MeshStandardMaterial): Mesh {
  const r = Math.min(round, (z1 - z0) / 2 - 1e-4);
  const geo = new ExtrudeGeometry(shape, {
    depth: z1 - z0 - 2 * Math.max(0, r),
    bevelEnabled: r > 0,
    bevelThickness: r,
    bevelSize: r,
    bevelOffset: -r,
    bevelSegments: 4,
    curveSegments: 16,
  });
  const m = new Mesh(geo, mat);
  m.position.z = z0 + Math.max(0, r);
  return m;
}

/**
 * A turned leg's profile, (radius, height) from the floor up: a brass castor cup, a bun foot, a
 * swelling urn with a ring below and a collar above, and a neck up to the square block.
 */
const LEG_PROFILE: [number, number][] = [
  [0.0001, 0.035],
  [0.062, 0.035],
  [0.067, 0.048],
  [0.064, 0.064],
  [0.052, 0.078],
  [0.06, 0.088],
  [0.061, 0.096],
  [0.05, 0.106],
  [0.064, 0.135],
  [0.079, 0.175],
  [0.085, 0.215],
  [0.08, 0.255],
  [0.066, 0.29],
  [0.053, 0.315],
  [0.061, 0.327],
  [0.066, 0.338],
  [0.06, 0.35],
  [0.052, 0.36],
  [0.052, 0.378],
  [0.068, 0.388],
  [0.072, 0.4],
  [0.072, 0.405],
  [0.0001, 0.405],
];

function turnedLeg(height: number, wood: MeshStandardMaterial, brass: MeshStandardMaterial): Group {
  const g = new Group();
  const k = height / 0.405;
  const wood2 = new LatheGeometry(
    LEG_PROFILE.map(([r, h]) => new Vector2(r, h * k)),
    40,
  );
  const leg = new Mesh(wood2, wood);
  leg.rotation.x = Math.PI / 2;
  const cup = new Mesh(
    new LatheGeometry(
      [
        [0.0001, 0],
        [0.055, 0],
        [0.06, 0.006],
        [0.064, 0.03],
        [0.063, 0.036 * k],
        [0.0001, 0.036 * k],
      ].map(([r, h]) => new Vector2(r!, h!)),
      40,
    ),
    brass,
  );
  cup.rotation.x = Math.PI / 2;
  g.add(leg, cup);
  return g;
}

export interface SnookerBodyParams {
  table: TableSpec;
  trim: TableTrim;
  railTop: number;
  cushionTop: number;
  /** Outer half-sizes of the rails. */
  hx: number;
  hy: number;
  /** The cut-out in the rails for the cushions and pockets. */
  railHole: readonly Vec2[];
  pockets: readonly {
    pocket: PocketSpec;
    outline: readonly Vec2[];
    centre: Vec2;
    backRadius: number;
  }[];
  wood: MeshStandardMaterial;
  cloth: MeshStandardMaterial;
  /** The room's environment map, for the parts below the rails. */
  env: Texture | null;
}

export function buildSnookerBody(q: SnookerBodyParams): {
  group: Group;
  runners: Map<string, Vec3[]>;
  floorZ: number;
} {
  const B = SNOOKER_BODY;
  const g = new Group();
  const { hx, hy } = q;
  const wood = q.wood;
  // The frieze and legs are a shade darker than the polished rail tops.
  const dark = wood.clone();
  dark.color.multiplyScalar(0.9);
  dark.roughness = 0.42;
  // The canopy lights the cloth from above; the sides of the table are lit by the room.
  const roomLit = (mat: MeshStandardMaterial, k: number) => {
    if (!q.env) return;
    mat.envMap = q.env;
    mat.envMapIntensity = k;
  };
  roomLit(wood, 0.6);
  roomLit(dark, 0.8);

  // Six independent cushion-rail sections: two on each long side (split at the
  // middle pocket) and one across each short end. The frieze below remains continuous.
  // Each section is its own solid, with a small clearance at every pocket junction.
  const railGap = 0.022;
  const addRailSection = (side: 'x' | 'y', sign: -1 | 1, from: number, to: number) => {
    const outer = side === 'y' ? sign * hy : sign * hx;
    const inner = side === 'y' ? sign * (hy - q.trim.railWidth) : sign * (hx - q.trim.railWidth);
    const shape = new Shape();
    if (side === 'y') {
      shape.moveTo(from, outer);
      shape.lineTo(to, outer);
      shape.lineTo(to, inner);
      shape.lineTo(from, inner);
    } else {
      shape.moveTo(outer, from);
      shape.lineTo(outer, to);
      shape.lineTo(inner, to);
      shape.lineTo(inner, from);
    }
    shape.closePath();
    g.add(slab(shape, B.railBottom, q.railTop, 0.004, wood));
  };
  for (const sign of [-1, 1] as const) {
    // Long rails: the middle pocket divides each side into two separate sections.
    const sidePockets = q.pockets
      .filter((pk) => Math.abs(pk.pocket.position.y - sign * hy) < 0.16)
      .map((pk) => pk.pocket.position.x)
      .sort((a, b) => a - b);
    const cuts = [-hx, ...sidePockets, hx];
    for (let i = 0; i < cuts.length - 1; i++) {
      const from = cuts[i]! + railGap;
      const to = cuts[i + 1]! - railGap;
      if (to - from > 0.05) addRailSection('y', sign, from, to);
    }
    // Short rails: one section between the two corner pockets.
    const endPockets = q.pockets
      .filter((pk) => Math.abs(pk.pocket.position.x - sign * hx) < 0.16)
      .map((pk) => pk.pocket.position.y)
      .sort((a, b) => a - b);
    const lo = endPockets[0] ?? -hy;
    const hi = endPockets[endPockets.length - 1] ?? hy;
    addRailSection('x', sign, lo + railGap, hi - railGap);
  }

  // The frieze, set well back under the rails (so the corner nets and ball rails hang clear of it),
  // with small recesses where the nets need room.
  const fx = hx - B.friezeInset;
  const fy = hy - B.friezeInset;
  const n = B.cornerRecess;
  const mw = B.middleRecessHalfWidth;
  const md = B.middleRecessDepth;
  g.add(slab(toShape(friezePlan(fx, fy, n, mw, md)), B.friezeBottom, B.mouldingBottom, 0, dark));
  // Base moulding, standing proud of the frieze.
  const lip = 0.012;
  g.add(
    slab(
      toShape(friezePlan(fx + lip, fy + lip, n - lip, mw - lip, md - lip)),
      B.friezeBottom - 0.028,
      B.friezeBottom,
      0.007,
      dark,
    ),
  );

  // Raised panel frames on the frieze between the recesses.
  const frameT = 0.004;
  const frameW = 0.012;
  const pz0 = B.friezeBottom + 0.04;
  const pz1 = B.mouldingBottom - 0.04;
  const frame = (a: Vec2, b: Vec2, out: Vec2) => {
    // A rectangle of four thin strips on the face from a to b (plan), standing out along `out`.
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const cx = (a.x + b.x) / 2 + out.x * frameT * 0.5;
    const cy = (a.y + b.y) / 2 + out.y * frameT * 0.5;
    const rot = Math.atan2(uy, ux);
    const strip = (l: number, h: number, ox: number, z: number) => {
      const m = new Mesh(new BoxGeometry(l, frameT, h), dark);
      m.position.set(cx + ux * ox, cy + uy * ox, z);
      m.rotation.z = rot;
      g.add(m);
    };
    strip(len, frameW, 0, pz0 + frameW / 2);
    strip(len, frameW, 0, pz1 - frameW / 2);
    strip(frameW, pz1 - pz0, -len / 2 + frameW / 2, (pz0 + pz1) / 2);
    strip(frameW, pz1 - pz0, len / 2 - frameW / 2, (pz0 + pz1) / 2);
  };
  const gap = 0.05;
  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const x0 = sx * (mw + gap);
      const x1 = sx * (fx - n - gap);
      frame({ x: Math.min(x0, x1), y: sy * fy }, { x: Math.max(x0, x1), y: sy * fy }, { x: 0, y: sy });
    }
  }
  for (const sx of [-1, 1])
    frame({ x: sx * fx, y: -(fy - n - gap) }, { x: sx * fx, y: fy - n - gap }, { x: sx, y: 0 });

  // Legs: four along each long side, under the corners and a third of the way in from them. Each
  // has a square block under the frieze, then the turned leg down to the floor.
  const floorZ = q.cushionTop - B.height;
  const blockTop = B.friezeBottom - 0.028;
  const blockBottom = blockTop - 0.11;
  const mats = snookerPocketMaterials();
  for (const mat of Object.values(mats)) roomLit(mat, mat.envMapIntensity * 0.2);
  const brass = mats.brass;
  const legAt: { x: number; y: number; w: number; d: number }[] = [];
  // Evenly spaced along the sides: corner legs at ±cornerX, the others a third of the way in.
  const cornerX = fx + lip - 0.085;
  const innerX = cornerX / 3;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      // Under the corner, flush with the outside of the frieze.
      const cw = 0.17;
      legAt.push({ x: sx * (fx + lip - cw / 2), y: sy * (fy + lip - cw / 2), w: cw, d: cw });
      legAt.push({ x: sx * innerX, y: sy * (fy + lip - 0.085), w: 0.17, d: 0.17 });
    }
  for (const l of legAt) {
    const block = slab(
      toShape([
        { x: l.x - l.w / 2, y: l.y - l.d / 2 },
        { x: l.x + l.w / 2, y: l.y - l.d / 2 },
        { x: l.x + l.w / 2, y: l.y + l.d / 2 },
        { x: l.x - l.w / 2, y: l.y + l.d / 2 },
      ]),
      blockBottom,
      blockTop,
      0.006,
      dark,
    );
    g.add(block);
    const leg = turnedLeg(blockBottom - floorZ, dark, brass);
    leg.position.set(l.x, l.y, floorZ);
    g.add(leg);
  }

  // Pockets.
  const runners = new Map<string, Vec3[]>();
  for (const pk of q.pockets) {
    const built = buildSnookerPocket(
      {
        pocket: pk.pocket,
        outline: pk.outline,
        centre: pk.centre,
        backRadius: pk.backRadius,
        railTop: q.railTop,
        hx,
        hy,
        cornerRadius: B.cornerRadius,
        railWidth: q.trim.railWidth,
        slate: B.slate,
        // Just inside the rail edge, under its overhang, well clear of the frieze.
        runnerOut: hy - 0.03,
        ballRadius: q.table.balls.object.radius,
        wellDepth: B.wellDepth,
        cloth: q.cloth,
      },
      mats,
    );
    g.add(built.group);
    runners.set(pk.pocket.id, built.runner);
  }
  return { group: g, runners, floorZ };
}
