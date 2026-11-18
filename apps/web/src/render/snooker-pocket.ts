import type { PocketSpec, Vec2 } from '@cuesports/shared';
import {
  BufferGeometry,
  BoxGeometry,
  CurvePath,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineCurve3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  Shape,
  ShapeUtils,
  Vector2,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { leatherTexture, netTexture } from './textures';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const hiddenMat = new MeshBasicMaterial({ visible: false });

/** Height of the padded leather roll above the rail, and of the brass collar under the net. */
const PAD = 0.007;
const BAND = 0.02;
/** Length of each lobe of the scalloped hem of the leather skirt. */
const SCALLOP = 0.024;

/** Height of the padded leather top at radius r: a flat crown with rolled edges either side. */
function domeZ(r: number, r0: number, r1: number, top: number, pad: number): number {
  const roll = Math.min(0.018, (r1 - r0) / 2);
  const e = Math.min(1, Math.max(0, Math.min(r - r0, r1 - r) / roll));
  return top + pad * Math.sqrt(e * (2 - e));
}

/** Balls the wire runners under a snooker pocket hold before the net starts to fill. */
export const RUNNER_BALLS = 6;

/** Distance from (cx, cy) along a unit direction to the edge of the box |x| ≤ hx, |y| ≤ hy. */
function rayToBox(cx: number, cy: number, dx: number, dy: number, hx: number, hy: number): number {
  const tx = dx > 1e-9 ? (hx - cx) / dx : dx < -1e-9 ? (-hx - cx) / dx : Infinity;
  const ty = dy > 1e-9 ? (hy - cy) / dy : dy < -1e-9 ? (-hy - cy) / dy : Infinity;
  return Math.min(tx, ty);
}

/** Distance from (cx, cy) along a unit direction to the first crossing of a closed outline. */
function rayToOutline(o: readonly Vec2[], cx: number, cy: number, dx: number, dy: number): number {
  let best = Infinity;
  for (let i = 0; i < o.length; i++) {
    const a = o[i]!;
    const b = o[(i + 1) % o.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a.x - cx) * ey - (a.y - cy) * ex) / den;
    const u = ((a.x - cx) * dy - (a.y - cy) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return best;
}

/** A surface from a grid of points (rows × cols), with UVs in tiles of `tile` metres. */
function gridMesh(grid: Vector3[][], tile: number): BufferGeometry {
  const rows = grid.length;
  const cols = grid[0]!.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // u runs along the rows (arc length down the middle column), v across each row.
  const uRow: number[] = [0];
  const mid = cols >> 1;
  for (let i = 1; i < rows; i++) uRow.push(uRow[i - 1]! + grid[i]![mid]!.distanceTo(grid[i - 1]![mid]!));
  for (let i = 0; i < rows; i++) {
    let v = 0;
    for (let j = 0; j < cols; j++) {
      const p = grid[i]![j]!;
      if (j > 0) v += p.distanceTo(grid[i]![j - 1]!);
      pos.push(p.x, p.y, p.z);
      uv.push(uRow[i]! / tile, v / tile);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + cols;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A polyline as a curve, for tubes. */
function polyCurve(pts: readonly Vec3[]): CurvePath<Vector3> {
  const c = new CurvePath<Vector3>();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    c.add(new LineCurve3(new Vector3(a.x, a.y, a.z), new Vector3(b.x, b.y, b.z)));
  }
  return c;
}

/** Point a distance s along a polyline. */
export function alongPath(path: readonly Vec3[], s: number): Vec3 {
  let left = Math.max(0, s);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (left <= l || i === path.length - 1) {
      const k = l > 0 ? Math.min(1, left / l) : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
    }
    left -= l;
  }
  return { ...path[0]! };
}

/**
 * Where the balls on a runner sit, as distances along it: the first against the end stop, each
 * next one touching the one before (measured straight, so balls on a bend never overlap).
 */
export function runnerSlots(path: readonly Vec3[], ballRadius: number): number[] {
  const L = pathLength(path);
  const gap = 2.01 * ballRadius;
  const out = [L];
  for (let k = 1; k < RUNNER_BALLS; k++) {
    const prev = alongPath(path, out[k - 1]!);
    // Step back until a full ball's width away in a straight line, then refine.
    let lo = out[k - 1]!;
    let hi = lo;
    const far = (s: number) => {
      const q = alongPath(path, s);
      return Math.hypot(q.x - prev.x, q.y - prev.y, q.z - prev.z) >= gap;
    };
    while (hi > 0 && !far(hi)) hi = Math.max(0, hi - gap * 0.25);
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (far(mid)) hi = mid;
      else lo = mid;
    }
    out.push(hi);
  }
  return out;
}

export function pathLength(path: readonly Vec3[]): number {
  let l = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    l += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return l;
}

export interface SnookerPocketMaterials {
  leather: MeshStandardMaterial;
  stitch: MeshStandardMaterial;
  brass: MeshStandardMaterial;
  net: MeshStandardMaterial;
  wire: MeshStandardMaterial;
  strap: MeshStandardMaterial;
  hole: MeshStandardMaterial;
}

export function snookerPocketMaterials(): SnookerPocketMaterials {
  const leatherMap = leatherTexture('#74301a');
  leatherMap.wrapS = leatherMap.wrapT = RepeatWrapping;
  const net = netTexture();
  net.wrapS = net.wrapT = RepeatWrapping;
  // Below the rails these are lit by the room rather than the canopy, so they take more of it.
  return {
    leather: new MeshStandardMaterial({
      map: leatherMap,
      roughness: 0.48,
      metalness: 0,
      side: DoubleSide,
      envMapIntensity: 3,
    }),
    stitch: new MeshStandardMaterial({ color: '#efe3cc', roughness: 0.8, envMapIntensity: 3 }),
    brass: new MeshStandardMaterial({
      color: '#c99a3e',
      roughness: 0.28,
      metalness: 0.95,
      envMapIntensity: 4,
    }),
    net: new MeshStandardMaterial({
      map: net,
      alphaTest: 0.35,
      roughness: 0.95,
      side: DoubleSide,
      envMapIntensity: 4,
    }),
    // The ball-return rails are polished brass, like the plates and collar.
    wire: new MeshStandardMaterial({ color: '#b8893a', roughness: 0.3, metalness: 0.9, envMapIntensity: 4 }),
    strap: new MeshStandardMaterial({ color: '#4a2a1a', roughness: 0.6, envMapIntensity: 4 }),
    hole: new MeshStandardMaterial({ color: '#120804', roughness: 0.9 }),
  };
}

export interface SnookerPocketParams {
  pocket: PocketSpec;
  /** The hole's outline (slate edge, jaws, back), as cut out of the cloth. */
  outline: readonly Vec2[];
  /** Middle of the hole, where balls drop. */
  centre: Vec2;
  /** Radius of the back of the hole from the pocket position. */
  backRadius: number;
  railTop: number;
  /** Outer half-sizes of the rails, and the radius of their rounded corners. */
  hx: number;
  hy: number;
  cornerRadius: number;
  /** Width of the wooden rail (where the brass flanges sit, along its middle). */
  railWidth: number;
  /** Thickness of the slate: the cloth lines the hole this far down before the net. */
  slate: number;
  /** Distance from the table's centre line out to the line the runners run along. */
  runnerOut: number;
  ballRadius: number;
  /** Depth below the slate of the centre of a ball sitting on the runners under the ring. */
  wellDepth: number;
  /** Cloth, for the lining of the hole. */
  cloth: MeshStandardMaterial;
}

/** Distance along a ray from inside a rounded rectangle (half-sizes hx, hy; corner radius r) to its edge. */
function rayToRoundedBox(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  hx: number,
  hy: number,
  r: number,
): number {
  const inside = (t: number) => {
    const x = Math.abs(cx + dx * t);
    const y = Math.abs(cy + dy * t);
    if (x > hx || y > hy) return false;
    const ox = Math.max(0, x - (hx - r));
    const oy = Math.max(0, y - (hy - r));
    return ox * ox + oy * oy <= r * r;
  };
  let lo = 0;
  let hi = rayToBox(cx, cy, dx, dy, hx, hy);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inside(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** A flat bar (width w, thickness t) from a to b, with its face turned towards `face`. */
function bar(a: Vector3, b: Vector3, w: number, t: number, face: Vector3, mat: MeshStandardMaterial): Mesh {
  const along = b.clone().sub(a);
  const len = along.length();
  along.normalize();
  const n = face
    .clone()
    .sub(along.clone().multiplyScalar(face.dot(along)))
    .normalize();
  const side = new Vector3().crossVectors(n, along);
  const m = new Mesh(new BoxGeometry(len, w, t), mat);
  m.matrixAutoUpdate = false;
  m.matrix.makeBasis(along, side, n).setPosition(a.clone().add(b).multiplyScalar(0.5));
  return m;
}

/**
 * A snooker pocket: a moulded leather over the brass pocket iron, wrapping the rail from inside the
 * hole down over the outside of the table; brass flanges screwed to the rail either side; the cloth
 * lining the hole down through the slate; a knotted string net hanging to a brass ring; and the ball
 * rails, hung from the ring and strapped to the frieze at the far end, that potted balls roll out
 * along. Returns the meshes and the path a ball's centre takes along the rails, from under the ring
 * to the end stop.
 */
export function buildSnookerPocket(
  q: SnookerPocketParams,
  m: SnookerPocketMaterials,
): { group: Group; runner: Vec3[] } {
  const g = new Group();
  const p = q.pocket;
  const R = q.ballRadius;
  const at = Math.atan2(p.axis.y, p.axis.x);
  const span = ((p.kind === 'corner' ? 70 : 96) * Math.PI) / 180;
  const rIn = q.backRadius;
  const top = q.railTop + 0.004;

  // ---- Leather: swept round the back of the hole. Each row is a profile across the leather: up
  // the inside of the hole, over the rail, and down the outside as a flap.
  const rows = 180;
  const cuts: [number, number][][] = [];
  const grid: Vector3[][] = [];
  const stitchTop: { p: Vector3; t: Vector3; n: Vector3 }[] = [];
  const stitchFlap: { p: Vector3; t: Vector3; n: Vector3 }[] = [];
  const at3 = (r: number, th: number, z: number) =>
    new Vector3(p.position.x + Math.cos(th) * r, p.position.y + Math.sin(th) * r, z);
  // Lace holes punched along the skirt, one over each scallop of its hem.
  const eyelets: { p: Vector3; t: Vector3; n: Vector3 }[] = [];
  let arc = 0;
  let lastOut: Vector3 | null = null;
  let lastLobe = Math.floor(-0.5);
  for (let i = 0; i <= rows; i++) {
    const th = at - span + (2 * span * i) / rows;
    const dx = Math.cos(th);
    const dy = Math.sin(th);
    const edge = rayToRoundedBox(p.position.x, p.position.y, dx, dy, q.hx, q.hy, q.cornerRadius);
    // Along the rail (at the ends of a middle pocket's leather) it stops on the rail top and the
    // "flap" runs down into the wood, out of sight.
    const reach = p.kind === 'corner' ? 0.2 : 0.075;
    const overEdge = edge + 0.003 <= rIn + reach;
    const rOut = Math.min(edge + 0.003, rIn + reach);
    // The flap hangs like a bucket: deep across the middle, rounding off towards the ends.
    const f = Math.cos(((th - at) / span) * (Math.PI / 2));
    const flap = 0.03 + 0.055 * Math.pow(Math.max(0, f), 0.8);
    // Scalloped hem: a run of shallow rounded lobes along the bottom of the skirt.
    const outer = at3(rOut, th, 0);
    if (lastOut) arc += outer.distanceTo(lastOut);
    lastOut = outer;
    const phase = arc / SCALLOP;
    const hem = q.railTop - flap - 0.005 * Math.sqrt(Math.abs(Math.sin(Math.PI * phase)));
    // The top is padded over the iron: a raised roll that flattens out under the brass plates.
    const pad = PAD;
    const z = (r: number) => domeZ(r, rIn, rOut, top, pad);
    const prof: [number, number][] = [
      [rIn + 0.001, -0.003],
      [rIn - 0.002, q.railTop - 0.02],
      [rIn - 0.003, top - 0.006],
    ];
    for (let k = 0; k <= 10; k++) {
      const r = rIn + ((rOut - rIn) * k) / 10;
      prof.push([r, z(r)]);
    }
    prof.push([rOut + 0.001, top - 0.006], [rOut + 0.001, hem + 0.004], [rOut - 0.002, hem]);
    grid.push(prof.map(([r, z]) => at3(r, th, z)));
    if (i === 0 || i === rows) cuts.push(prof);
    const t = new Vector3(-dy, dx, 0);
    const n = new Vector3(dx, dy, 0);
    if (i > 1 && i < rows - 1) {
      if (rOut - rIn > 0.03) {
        // Two rows of saddle stitching: round the lip of the hole and along the outer edge.
        stitchTop.push({ p: at3(rIn + 0.008, th, z(rIn + 0.008) + 0.0005), t, n });
        stitchTop.push({ p: at3(rOut - 0.008, th, z(rOut - 0.008) + 0.0005), t, n });
      }
      if (overEdge) {
        stitchFlap.push({ p: at3(rOut + 0.0006, th, q.railTop - flap + 0.008), t, n });
        // One hole per lobe, at its middle, in a line just under the roll.
        const here = Math.floor(phase - 0.5);
        if (here !== lastLobe && flap > 0.04) {
          // Face the holes square to the skirt, which follows the rail, not the pocket's radius.
          const et = new Vector3(-dy, dx, 0);
          const en = new Vector3(dx, dy, 0);
          if (Math.abs(Math.abs(outer.x) - q.hx) < Math.abs(Math.abs(outer.y) - q.hy)) {
            en.set(Math.sign(outer.x), 0, 0);
            et.set(0, Math.sign(outer.x), 0);
          } else {
            en.set(0, Math.sign(outer.y), 0);
            et.set(-Math.sign(outer.y), 0, 0);
          }
          const ep = at3(rOut, th, q.railTop - 0.022).addScaledVector(en, 0.0016);
          eyelets.push({ p: ep, t: et, n: en });
        }
        lastLobe = here;
      }
    }
  }
  g.add(new Mesh(gridMesh(grid, 0.05), m.leather));
  // The leather is a separate moulded piece laid over the rail, not part of it: close its cut ends
  // so its thickness shows where it stops on the rail.
  cuts.forEach((prof, k) => {
    const th = at + (k === 0 ? -span : span);
    const tri = ShapeUtils.triangulateShape(
      prof.map(([r, z]) => new Vector2(r, z)),
      [],
    );
    const pos: number[] = [];
    for (const [r, z] of prof) {
      const v = at3(r, th, z);
      pos.push(v.x, v.y, v.z);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute(
      'uv',
      new Float32BufferAttribute(
        prof.flatMap(([r, z]) => [r / 0.05, z / 0.05]),
        2,
      ),
    );
    geo.setIndex(tri.flat());
    geo.computeVertexNormals();
    g.add(new Mesh(geo, m.leather));
  });
  // Stitching: short cream dashes along the top and round the bottom of the flap.
  const dash = (pts: typeof stitchTop, onTop: boolean) => {
    if (pts.length === 0) return;
    const geo = onTop ? new BoxGeometry(0.004, 0.0011, 0.0008) : new BoxGeometry(0.004, 0.0008, 0.0011);
    const im = new InstancedMesh(geo, m.stitch, pts.length);
    const mx = new Matrix4();
    pts.forEach((s, k) => {
      mx.makeBasis(s.t, s.n, new Vector3(0, 0, 1)).setPosition(s.p);
      im.setMatrixAt(k, mx);
    });
    g.add(im);
  };
  dash(stitchTop, true);
  dash(stitchFlap, false);
  if (eyelets.length) {
    const hole = new InstancedMesh(new CylinderGeometry(0.0026, 0.0026, 0.004, 16), m.hole, eyelets.length);
    const mx = new Matrix4();
    eyelets.forEach((e, k) => {
      // Cylinder's axis is local y: point it out through the leather.
      mx.makeBasis(e.t, e.n, new Vector3(0, 0, 1)).setPosition(e.p);
      hole.setMatrixAt(k, mx);
    });
    g.add(hole);
  }

  // ---- Brass pocket-iron flanges either side, lying along the rail and screwed to it.
  for (const side of [-1, 1]) {
    const th = at + side * span;
    const e = at3(rIn + 0.03, th, 0);
    // Which rail the end of the leather lies on, and which way along it is away from the pocket.
    const onLong = q.hy - Math.abs(e.y) < q.hx - Math.abs(e.x);
    const dir = onLong
      ? new Vector3(Math.sign(e.x - p.position.x) || 1, 0, 0)
      : new Vector3(0, Math.sign(e.y - p.position.y) || 1, 0);
    const mid = onLong
      ? new Vector3(e.x, Math.sign(e.y) * (q.hy - q.railWidth / 2), 0)
      : new Vector3(Math.sign(e.x) * (q.hx - q.railWidth / 2), e.y, 0);
    const w = 0.056;
    const h = 0.024;
    const c = mid.clone().addScaledVector(dir, w / 2 + 0.006);
    const s = new Shape();
    s.moveTo(-w / 2 + h / 2, -h / 2);
    s.lineTo(w / 2 - h / 2, -h / 2);
    s.absarc(w / 2 - h / 2, 0, h / 2, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(-w / 2 + h / 2, h / 2);
    s.absarc(-w / 2 + h / 2, 0, h / 2, Math.PI / 2, (3 * Math.PI) / 2, false);
    const plate = new Mesh(
      new ExtrudeGeometry(s, {
        depth: 0.0015,
        bevelEnabled: true,
        bevelSize: 0.0006,
        bevelThickness: 0.0006,
        bevelSegments: 2,
      }),
      m.brass,
    );
    plate.position.set(c.x, c.y, q.railTop + 0.0006);
    plate.rotation.z = Math.atan2(dir.y, dir.x);
    g.add(plate);
    for (const k of [-1, 1]) {
      // Domed screw heads.
      const screw = new Mesh(new SphereGeometry(0.0034, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.brass);
      screw.rotation.x = Math.PI / 2;
      screw.scale.set(1, 0.55, 1);
      const sc = c.clone().addScaledVector(dir, k * 0.017);
      screw.position.set(sc.x, sc.y, q.railTop + 0.0033);
      g.add(screw);
    }
  }

  // ---- The leather lines the hole down through the slate; the cloth stays on the cushions and the
  // bed, and stops at the jaws.
  const lining = new Shape(q.outline.map((v) => ({ x: v.x, y: v.y }) as never));
  const liningMat = m.leather.clone();
  liningMat.color.multiplyScalar(0.7);
  const chute = new Mesh(new ExtrudeGeometry(lining, { depth: q.slate, bevelEnabled: false }), [
    hiddenMat,
    liningMat,
  ]);
  chute.position.z = -q.slate;
  g.add(chute);

  // ---- Net: from under the slate round the hole down to a brass ring a little wider than a ball.
  const floorZ = -q.wellDepth + R;
  const ringR = R * 1.12;
  const ringZ = floorZ + R * 0.35;
  const netTop = -q.slate - 0.002;
  const around = 48;
  const down = 16;
  const rim: Vec2[] = [];
  for (let k = 0; k < around; k++) {
    const th = (2 * Math.PI * k) / around;
    const d = rayToOutline(q.outline, q.centre.x, q.centre.y, Math.cos(th), Math.sin(th));
    rim.push({
      x: q.centre.x + Math.cos(th) * (Number.isFinite(d) ? d - 0.002 : ringR),
      y: q.centre.y + Math.sin(th) * (Number.isFinite(d) ? d - 0.002 : ringR),
    });
  }
  let perimeter = 0;
  for (let k = 0; k < around; k++)
    perimeter += Math.hypot(rim[(k + 1) % around]!.x - rim[k]!.x, rim[(k + 1) % around]!.y - rim[k]!.y);
  const netGrid: Vector3[][] = [];
  for (let k = 0; k <= around; k++) {
    const th = (2 * Math.PI * k) / around;
    const top0 = rim[k % around]!;
    const col: Vector3[] = [];
    for (let j = 0; j <= down; j++) {
      const t = j / down;
      // The bag sags outward a little between the rim and the ring.
      const bulge = 0.006 * Math.sin(Math.PI * Math.pow(t, 0.7));
      const bx = q.centre.x + Math.cos(th) * ringR;
      const by = q.centre.y + Math.sin(th) * ringR;
      const x = top0.x + (bx - top0.x) * t + Math.cos(th) * bulge;
      const y = top0.y + (by - top0.y) * t + Math.sin(th) * bulge;
      const z = netTop + (ringZ + BAND / 2 - netTop) * t;
      col.push(new Vector3(x, y, z));
    }
    netGrid.push(col);
  }
  // Mesh holes about 2cm across; a whole number round the bag so the pattern meets itself.
  const netGeo = gridMesh(netGrid, 1);
  const uvs = netGeo.getAttribute('uv');
  const reps = Math.max(8, Math.round(perimeter / 0.02));
  const depthReps = Math.max(4, Math.round((netTop - ringZ) / 0.018));
  for (let k = 0; k <= around; k++)
    for (let j = 0; j <= down; j++)
      uvs.setXY(k * (down + 1) + j, (k / around) * reps, (j / down) * depthReps);
  g.add(new Mesh(netGeo, m.net));
  // A turned brass collar the net is laced to, with a rolled lip top and bottom.
  const band = new Mesh(new CylinderGeometry(ringR + 0.003, ringR + 0.002, BAND, 40, 1, true), m.brass);
  band.rotation.x = Math.PI / 2;
  band.position.set(q.centre.x, q.centre.y, ringZ);
  g.add(band);
  for (const k of [-1, 1]) {
    const lip = new Mesh(new TorusGeometry(ringR + 0.003, 0.0025, 8, 40), m.brass);
    lip.position.set(q.centre.x, q.centre.y, ringZ + (k * BAND) / 2);
    g.add(lip);
  }

  // ---- Ball rails: out from under the ring past the frieze, then along the side of the table.
  const sy = Math.sign(p.position.y) || 1;
  const along = p.kind === 'corner' ? -Math.sign(p.position.x) || -1 : 1;
  const slot = 2.02 * R;
  // A little longer than six balls end to end, so they still fit round the bend.
  const total = (RUNNER_BALLS - 1) * slot + 0.012;
  const out = q.runnerOut - Math.abs(q.centre.y);
  const turn = 0.035;
  const raw: Vec3[] = [{ x: q.centre.x, y: q.centre.y, z: floorZ }];
  const straight = Math.max(0.01, out - turn);
  raw.push({ x: q.centre.x, y: q.centre.y + sy * straight, z: floorZ - 0.006 });
  for (let k = 1; k <= 6; k++) {
    const a = (k / 6) * (Math.PI / 2);
    raw.push({
      x: q.centre.x + along * turn * (1 - Math.cos(a)),
      y: q.centre.y + sy * (straight + turn * Math.sin(a)),
      z: floorZ - 0.006 - 0.004 * (k / 6),
    });
  }
  const last = raw[raw.length - 1]!;
  raw.push({ x: last.x + along * 0.5, y: last.y, z: last.z - 0.04 });
  // Cut to length: the last of the six balls sits right under the ring.
  const runner: Vec3[] = [raw[0]!];
  let acc = 0;
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1]!;
    const b = raw[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (acc + l >= total) {
      runner.push(alongPath([a, b], total - acc));
      break;
    }
    runner.push(b);
    acc += l;
  }

  // Two coated wires the balls sit between, hung from the ring, with a turned-up end stop.
  const w = 0.55 * R;
  const drop = Math.sqrt(R * R - w * w);
  const ends: Vector3[] = [];
  for (const s of [-1, 1]) {
    const pts: Vec3[] = [];
    runner.forEach((c, i) => {
      const a = runner[Math.max(0, i - 1)]!;
      const b = runner[Math.min(runner.length - 1, i + 1)]!;
      let tx = b.x - a.x;
      let ty = b.y - a.y;
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      pts.push({ x: c.x - ty * w * s, y: c.y + tx * w * s, z: c.z - drop });
    });
    const first = pts[0]!;
    const end = pts[pts.length - 1]!;
    const prev = pts[pts.length - 2]!;
    const ex = end.x - prev.x;
    const ey = end.y - prev.y;
    const el = Math.hypot(ex, ey) || 1;
    const stop = { x: end.x + (ex / el) * 0.016, y: end.y + (ey / el) * 0.016, z: end.z + R * 1.3 };
    const wire = [
      { x: first.x, y: first.y, z: ringZ - 0.003 },
      ...pts,
      { x: end.x + (ex / el) * 0.012, y: end.y + (ey / el) * 0.012, z: end.z + 0.008 },
      stop,
    ];
    g.add(new Mesh(new TubeGeometry(polyCurve(wire), wire.length * 6, 0.0028, 8, false), m.wire));
    ends.push(new Vector3(stop.x, stop.y, stop.z));
  }
  // The far end hangs from a leather strap screwed to the underside of the rail.
  const e = ends[0]!.clone().add(ends[1]!).multiplyScalar(0.5);
  const anchor = new Vector3(e.x, e.y, -q.slate - 0.002);
  g.add(bar(e, anchor, 0.014, 0.003, new Vector3(0, sy, 0), m.strap));
  const cross = bar(ends[0]!, ends[1]!, 0.006, 0.006, new Vector3(0, 0, 1), m.wire);
  g.add(cross);
  const screw = new Mesh(new CylinderGeometry(0.004, 0.004, 0.003, 14), m.brass);
  screw.position.set(anchor.x, anchor.y + sy * 0.003, anchor.z - 0.008);
  screw.rotation.x = Math.PI / 2;
  g.add(screw);
  return { group: g, runner };
}
