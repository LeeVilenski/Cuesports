import { DEG, detCos, detSin, type PocketSpec, type TableSpec, type Vec2 } from '@cuesports/shared';

/** A straight piece of cushion nose line. Balls collide with it as a capsule of their radius. */
export interface Segment {
  id: string;
  a: Vec2;
  b: Vec2;
  /** 'pocket' is the back of the pocket, which only a ball dropping into it can reach. */
  kind: 'rail' | 'jaw' | 'pocket';
  pocket?: string;
}

export interface TableGeometry {
  segments: Segment[];
  pockets: PocketSpec[];
  halfLength: number;
  halfWidth: number;
}

const ARC_STEPS = 8;

interface Tip {
  pocket: PocketSpec;
  /** Point where the nose line meets the jaw facing (before rounding). */
  tip: Vec2;
  /** Direction along the rail towards the pocket. */
  u: Vec2;
  /** Outward normal of the rail (away from the playfield). */
  out: Vec2;
  rail: 'bottom' | 'top' | 'left' | 'right';
}

function pocketTips(p: PocketSpec, hl: number, hw: number): Tip[] {
  const w = p.mouthWidth;
  if (p.kind === 'corner') {
    const sx = Math.sign(p.axis.x);
    const sy = Math.sign(p.axis.y);
    const d = w / Math.SQRT2;
    return [
      {
        pocket: p,
        tip: { x: sx * hl - sx * d, y: sy * hw },
        u: { x: sx, y: 0 },
        out: { x: 0, y: sy },
        rail: sy > 0 ? 'top' : 'bottom',
      },
      {
        pocket: p,
        tip: { x: sx * hl, y: sy * hw - sy * d },
        u: { x: 0, y: sy },
        out: { x: sx, y: 0 },
        rail: sx > 0 ? 'right' : 'left',
      },
    ];
  }
  // Side pocket on a long rail.
  const sy = Math.sign(p.axis.y);
  const cx = p.position.x;
  const rail = sy > 0 ? 'top' : 'bottom';
  return [
    { pocket: p, tip: { x: cx - w / 2, y: sy * hw }, u: { x: 1, y: 0 }, out: { x: 0, y: sy }, rail },
    { pocket: p, tip: { x: cx + w / 2, y: sy * hw }, u: { x: -1, y: 0 }, out: { x: 0, y: sy }, rail },
  ];
}

/**
 * Builds the cushion nose segments from the table spec: straight rails between pockets, a
 * rounded knuckle at each jaw tip (an arc of radius jawRadius, split into short segments),
 * and a straight jaw facing that runs into the pocket at the facing angle.
 */
export function buildTableGeometry(table: TableSpec): TableGeometry {
  const hl = table.playfield.length / 2;
  const hw = table.playfield.width / 2;
  const segments: Segment[] = [];
  const railPoints: Record<Tip['rail'], { s: number; p: Vec2 }[]> = {
    bottom: [],
    top: [],
    left: [],
    right: [],
  };

  for (const pocket of table.pockets) {
    const ends: Vec2[] = [];
    pocketTips(pocket, hl, hw).forEach((t, i) => {
      const delta = (180 - pocket.jawAngle) * DEG;
      const cd = detCos(delta);
      const sd = detSin(delta);
      const f = { x: cd * t.u.x + sd * t.out.x, y: cd * t.u.y + sd * t.out.y };
      const r = pocket.jawRadius;
      const tl = (r * sd) / (1 + cd); // r·tan(δ/2)
      const t1 = { x: t.tip.x - t.u.x * tl, y: t.tip.y - t.u.y * tl };
      const t2 = { x: t.tip.x + f.x * tl, y: t.tip.y + f.y * tl };
      const c = { x: t1.x + t.out.x * r, y: t1.y + t.out.y * r };
      railPoints[t.rail].push({ s: t.rail === 'left' || t.rail === 'right' ? t1.y : t1.x, p: t1 });

      // Knuckle arc from t1 to t2 around c, turning towards `out`.
      // The path turns towards `out`; rotating t1 about c in the same sense moves it towards t2.
      const sign = Math.sign(t.u.x * t.out.y - t.u.y * t.out.x); // +1 = counter-clockwise
      const v0 = { x: t1.x - c.x, y: t1.y - c.y };
      let prev = t1;
      for (let k = 1; k <= ARC_STEPS; k++) {
        const ang = (sign * delta * k) / ARC_STEPS;
        const ca = detCos(ang);
        const sa = detSin(ang);
        const pt = k === ARC_STEPS ? t2 : { x: c.x + v0.x * ca - v0.y * sa, y: c.y + v0.x * sa + v0.y * ca };
        segments.push({
          id: `jaw:${pocket.id}:${i}:arc${k}`,
          a: prev,
          b: pt,
          kind: 'jaw',
          pocket: pocket.id,
        });
        prev = pt;
      }

      // Jaw facing: from t2 deep enough to reach the centre of the fall circle.
      const depth = pocket.shelfDepth + pocket.fallRadius;
      const along = f.x * pocket.axis.x + f.y * pocket.axis.y;
      const len = depth / Math.max(along, 0.2);
      const end = { x: t.tip.x + f.x * len, y: t.tip.y + f.y * len };
      segments.push({ id: `jaw:${pocket.id}:${i}:facing`, a: t2, b: end, kind: 'jaw', pocket: pocket.id });
      ends.push(end);
    });
    segments.push(...pocketBack(pocket, ends));
  }

  const corners: Record<Tip['rail'], [Vec2, Vec2, number]> = {
    bottom: [{ x: -hl, y: -hw }, { x: hl, y: -hw }, 0],
    top: [{ x: -hl, y: hw }, { x: hl, y: hw }, 0],
    left: [{ x: -hl, y: -hw }, { x: -hl, y: hw }, 1],
    right: [{ x: hl, y: -hw }, { x: hl, y: hw }, 1],
  };
  for (const rail of ['bottom', 'right', 'top', 'left'] as const) {
    const pts = railPoints[rail].sort((p, q) => p.s - q.s);
    if (pts.length === 0) {
      const [a, b] = corners[rail];
      segments.push({ id: `rail:${rail}:0`, a, b, kind: 'rail' });
      continue;
    }
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const a = pts[i]!.p;
      const b = pts[i + 1]!.p;
      segments.push({ id: `rail:${rail}:${i / 2}`, a, b, kind: 'rail' });
    }
  }

  return { segments, pockets: table.pockets, halfLength: hl, halfWidth: hw };
}

/**
 * Closes the pocket behind the fall circle with an arc joining the ends of the two facings, so a
 * ball crossing the hole too fast to drop hits the back of the pocket instead of leaving the table.
 * Points come from normalised interpolation between directions (no trig), keeping it deterministic.
 */
function pocketBack(pocket: PocketSpec, ends: Vec2[]): Segment[] {
  const [e0, e1] = ends;
  if (!e0 || !e1) return [];
  const c = pocket.position;
  const r = (Math.hypot(e0.x - c.x, e0.y - c.y) + Math.hypot(e1.x - c.x, e1.y - c.y)) / 2;
  const unit = (v: Vec2): Vec2 => {
    const l = Math.sqrt(v.x * v.x + v.y * v.y);
    return { x: v.x / l, y: v.y / l };
  };
  const d0 = unit({ x: e0.x - c.x, y: e0.y - c.y });
  const d1 = unit({ x: e1.x - c.x, y: e1.y - c.y });
  const pts: Vec2[] = [e0];
  const half = ARC_STEPS;
  for (const [from, to] of [
    [d0, pocket.axis],
    [pocket.axis, d1],
  ] as const) {
    for (let k = 1; k <= half; k++) {
      const f = k / half;
      const d = unit({ x: from.x * (1 - f) + to.x * f, y: from.y * (1 - f) + to.y * f });
      pts.push({ x: c.x + d.x * r, y: c.y + d.y * r });
    }
  }
  pts[pts.length - 1] = e1;
  const segs: Segment[] = [];
  for (let k = 1; k < pts.length; k++) {
    segs.push({
      id: `back:${pocket.id}:${k}`,
      a: pts[k - 1]!,
      b: pts[k]!,
      kind: 'pocket',
      pocket: pocket.id,
    });
  }
  return segs;
}

const cache = new WeakMap<TableSpec, TableGeometry>();

export function tableGeometry(table: TableSpec): TableGeometry {
  let g = cache.get(table);
  if (!g) {
    g = buildTableGeometry(table);
    cache.set(table, g);
  }
  return g;
}
