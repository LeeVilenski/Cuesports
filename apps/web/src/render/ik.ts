/**
 * Small pure helpers for the procedural characters: two-bone IK, and walking paths around the table.
 * Everything here is in physics coordinates (x along the table, y across, z up).
 */

export interface P3 {
  x: number;
  y: number;
  z: number;
}
export interface P2 {
  x: number;
  y: number;
}

export const v3 = (x: number, y: number, z: number): P3 => ({ x, y, z });
export const add = (a: P3, b: P3): P3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: P3, b: P3): P3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: P3, k: number): P3 => v3(a.x * k, a.y * k, a.z * k);
export const dot = (a: P3, b: P3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a: P3): number => Math.hypot(a.x, a.y, a.z);
export const lerp3 = (a: P3, b: P3, k: number): P3 => add(a, scale(sub(b, a), k));
export const norm = (a: P3): P3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3(0, 0, 1);
};
export const cross = (a: P3, b: P3): P3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

/**
 * Two-bone IK: the middle joint (elbow or knee) for a chain from `root` with bone lengths `l1` and
 * `l2` reaching for `target`, bending towards `pole`. An out-of-reach target straightens the chain
 * towards it. Returns the middle joint and where the end actually lands.
 */
export function twoBone(root: P3, target: P3, l1: number, l2: number, pole: P3): { mid: P3; end: P3 } {
  const toT = sub(target, root);
  const d = Math.min(Math.max(len(toT), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const dir = norm(toT);
  // Distance along the root→target line to the foot of the middle joint, and its height off the line.
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // Bend direction: the pole direction with its component along the chain removed.
  const p = sub(pole, root);
  let bend = sub(p, scale(dir, dot(p, dir)));
  if (len(bend) < 1e-6) bend = cross(dir, Math.abs(dir.z) < 0.9 ? v3(0, 0, 1) : v3(1, 0, 0));
  bend = norm(bend);
  const mid = add(add(root, scale(dir, a)), scale(bend, h));
  return { mid, end: add(root, scale(dir, d)) };
}

/**
 * Distance along a ray from `p` in direction `d` (unit, 2D) to where it leaves the rectangle
 * |x| ≤ hx, |y| ≤ hy. Zero if `p` is already outside.
 */
export function exitDistance(p: P2, d: P2, hx: number, hy: number): number {
  if (Math.abs(p.x) > hx || Math.abs(p.y) > hy) return 0;
  let t = Infinity;
  if (d.x > 1e-9) t = Math.min(t, (hx - p.x) / d.x);
  if (d.x < -1e-9) t = Math.min(t, (-hx - p.x) / d.x);
  if (d.y > 1e-9) t = Math.min(t, (hy - p.y) / d.y);
  if (d.y < -1e-9) t = Math.min(t, (-hy - p.y) / d.y);
  return t;
}

/** Position on the perimeter of the rectangle |x| ≤ hx, |y| ≤ hy, measured anticlockwise from (hx, -hy). */
function perimeterParam(p: P2, hx: number, hy: number): number {
  // Snap to the nearest side.
  const dx = hx - Math.abs(p.x);
  const dy = hy - Math.abs(p.y);
  const W = 2 * hy;
  const L = 2 * hx;
  if (dx < dy) {
    if (p.x > 0) return Math.min(Math.max(p.y + hy, 0), W); // right side, going +y
    return W + L + Math.min(Math.max(hy - p.y, 0), W); // left side, going −y
  }
  if (p.y > 0) return W + Math.min(Math.max(hx - p.x, 0), L); // top, going −x
  return 2 * W + L + Math.min(Math.max(p.x + hx, 0), L); // bottom, going +x
}

function perimeterPoint(s: number, hx: number, hy: number): P2 {
  const W = 2 * hy;
  const L = 2 * hx;
  const P = 2 * (W + L);
  s = ((s % P) + P) % P;
  if (s <= W) return { x: hx, y: -hy + s };
  if (s <= W + L) return { x: hx - (s - W), y: hy };
  if (s <= 2 * W + L) return { x: -hx, y: hy - (s - W - L) };
  return { x: -hx + (s - 2 * W - L), y: -hy };
}

/**
 * A walking route from `a` to `b` that keeps clear of the table: out to a path running round the
 * table at half-size (hx, hy), the short way round, then in to `b`. Both ends are included.
 */
export function walkPath(a: P2, b: P2, hx: number, hy: number): P2[] {
  const sa = perimeterParam(a, hx, hy);
  const sb = perimeterParam(b, hx, hy);
  const P = 4 * (hx + hy);
  let ds = sb - sa;
  if (ds > P / 2) ds -= P;
  if (ds < -P / 2) ds += P;
  const pts: P2[] = [a, perimeterPoint(sa, hx, hy)];
  // Corners passed on the way.
  const corners = [0, 2 * hy, 2 * hy + 2 * hx, 4 * hy + 2 * hx];
  const passed: number[] = [];
  for (const c of corners)
    for (const k of [-1, 0, 1]) {
      const cc = c + k * P;
      if (ds > 0 ? cc > sa && cc < sa + ds : cc < sa && cc > sa + ds) passed.push(cc);
    }
  passed.sort((x, y) => (ds > 0 ? x - y : y - x));
  for (const c of passed) pts.push(perimeterPoint(c, hx, hy));
  pts.push(perimeterPoint(sb, hx, hy), b);
  // Drop zero-length legs.
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y) > 1e-4);
}

/** Total length of a polyline. */
export function pathLength(pts: P2[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return s;
}

/** The point and heading `s` metres along a polyline. */
export function alongPath(pts: P2[], s: number): { p: P2; heading: number } {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (s <= l || i === pts.length - 1) {
      const k = l > 0 ? Math.min(1, Math.max(0, s / l)) : 1;
      return {
        p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k },
        heading: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    s -= l;
  }
  return { p: pts[pts.length - 1]!, heading: 0 };
}
