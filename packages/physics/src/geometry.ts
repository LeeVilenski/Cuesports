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

/**
 * The slate's drop edge in a pocket: an arc of a circle through the shelf point on the pocket's
 * centre line and the points where it meets the two jaws. A ball whose centre is inside the circle
 * is over the hole.
 */
export interface DropEdge {
  centre: Vec2;
  radius: number;
  /** Where the edge meets jaw 0 and jaw 1, and its shallowest point (on the centre line). */
  jaw0: Vec2;
  jaw1: Vec2;
  mid: Vec2;
}

export interface TableGeometry {
  segments: Segment[];
  pockets: PocketSpec[];
  drops: Map<string, DropEdge>;
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

  const drops = new Map<string, DropEdge>();
  for (const p of table.pockets) {
    const d = dropEdge(segments, p);
    if (d) drops.set(p.id, d);
  }
  return { segments, pockets: table.pockets, drops, halfLength: hl, halfWidth: hw };
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

const mouthOf = (p: PocketSpec): Vec2 => ({
  x: p.position.x - p.axis.x * (p.shelfDepth + p.fallRadius),
  y: p.position.y - p.axis.y * (p.shelfDepth + p.fallRadius),
});

/** Jaw i of a pocket as a polyline from its tip into the pocket. */
function jawPoints(segments: Segment[], pocketId: string, i: number): Vec2[] {
  const segs = segments.filter((s) => s.id.startsWith(`jaw:${pocketId}:${i}:`));
  return segs.length ? [...segs.map((s) => s.a), segs[segs.length - 1]!.b] : [];
}

/** Where a jaw polyline first reaches `target` depth behind the mouth line, and the index after it. */
function jawAtDepth(pts: Vec2[], p: PocketSpec, target: number): { at: Vec2; next: number } | null {
  const m = mouthOf(p);
  const depth = (q: Vec2) => (q.x - m.x) * p.axis.x + (q.y - m.y) * p.axis.y - target;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!;
    const b = pts[k]!;
    const da = depth(a);
    const db = depth(b);
    if (da < 0 && db >= 0) {
      const f = -da / (db - da);
      return { at: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, next: k };
    }
  }
  return null;
}

/** Circle through three points (only exactly rounded operations, so it is deterministic). */
function circleThrough(a: Vec2, b: Vec2, c: Vec2): { centre: Vec2; radius: number } {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const centre = {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
  return { centre, radius: Math.sqrt((a.x - centre.x) ** 2 + (a.y - centre.y) ** 2) };
}

function dropEdge(segments: Segment[], p: PocketSpec): DropEdge | null {
  const m = mouthOf(p);
  const mid = { x: m.x + p.axis.x * p.shelfDepth, y: m.y + p.axis.y * p.shelfDepth };
  const sag = Math.max(p.dropSag, 1e-4);
  const j0 = jawAtDepth(jawPoints(segments, p.id, 0), p, p.shelfDepth + sag);
  const j1 = jawAtDepth(jawPoints(segments, p.id, 1), p, p.shelfDepth + sag);
  if (!j0 || !j1) return null;
  const { centre, radius } = circleThrough(mid, j0.at, j1.at);
  return { centre, radius, jaw0: j0.at, jaw1: j1.at, mid };
}

/** True when a point is over a pocket's drop (inside the drop-edge circle, in the pocket). */
export function overDrop(pos: Vec2, p: PocketSpec, d: DropEdge): boolean {
  const ex = pos.x - p.position.x;
  const ey = pos.y - p.position.y;
  const reach = p.fallRadius + p.mouthWidth;
  if (ex * ex + ey * ey > reach * reach) return false;
  const dx = pos.x - d.centre.x;
  const dy = pos.y - d.centre.y;
  return dx * dx + dy * dy <= d.radius * d.radius;
}

/**
 * Outline of a pocket's drop: the curved slate edge between the jaws, the jaws further in, and the
 * back of the pocket. A ball whose centre is inside it is over the hole. The renderer cuts exactly
 * this shape out of the cloth, so what you see matches the physics.
 */
export function dropOutline(geo: TableGeometry, pocketId: string, arcSteps = 16): Vec2[] {
  const p = geo.pockets.find((x) => x.id === pocketId);
  const d = geo.drops.get(pocketId);
  if (!p || !d) return [];
  const target = p.shelfDepth + Math.max(p.dropSag, 1e-4);
  const j0pts = jawPoints(geo.segments, pocketId, 0);
  const j1pts = jawPoints(geo.segments, pocketId, 1);
  const c0 = jawAtDepth(j0pts, p, target)!;
  const c1 = jawAtDepth(j1pts, p, target)!;
  const back = geo.segments.filter((s) => s.id.startsWith(`back:${pocketId}:`)).map((s) => s.b);
  // The slate edge from jaw 1 round through the shallowest point to jaw 0 (normalised
  // interpolation between directions from the centre, no trig).
  const unit = (v: Vec2): Vec2 => {
    const l = Math.sqrt(v.x * v.x + v.y * v.y);
    return { x: v.x / l, y: v.y / l };
  };
  const u1 = unit({ x: d.jaw1.x - d.centre.x, y: d.jaw1.y - d.centre.y });
  const um = unit({ x: d.mid.x - d.centre.x, y: d.mid.y - d.centre.y });
  const u0 = unit({ x: d.jaw0.x - d.centre.x, y: d.jaw0.y - d.centre.y });
  const edge: Vec2[] = [];
  for (const [from, to] of [
    [u1, um],
    [um, u0],
  ] as const) {
    for (let k = 1; k <= arcSteps; k++) {
      const f = k / arcSteps;
      const u = unit({ x: from.x * (1 - f) + to.x * f, y: from.y * (1 - f) + to.y * f });
      edge.push({ x: d.centre.x + u.x * d.radius, y: d.centre.y + u.y * d.radius });
    }
  }
  edge.pop(); // ends at jaw0, which starts the outline
  return [
    c0.at,
    ...j0pts.slice(c0.next),
    ...back.slice(0, -1),
    ...j1pts.slice(c1.next).reverse(),
    c1.at,
    ...edge,
  ];
}

/** Points along a pocket's curved slate edge, from jaw 1 to jaw 0 (for drawing the cloth lip). */
export function dropEdgePoints(geo: TableGeometry, pocketId: string, steps = 24): Vec2[] {
  const out = dropOutline(geo, pocketId, steps / 2);
  const d = geo.drops.get(pocketId);
  if (!d) return [];
  // The edge is the tail of the outline: from jaw 1's crossing round to jaw 0's.
  const i = out.findIndex((q) => q.x === d.jaw1.x && q.y === d.jaw1.y);
  return i < 0 ? [] : [...out.slice(i), out[0]!];
}
