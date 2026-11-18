import { wellCentre } from './well';
import {
  dropEdgePoints,
  dropOutline,
  TABLE_TRIM,
  tableGeometry,
  type TableGeometry,
} from '@cuesports/physics';
import type { TableSpec, Vec2 } from '@cuesports/shared';
import {
  BackSide,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  BoxGeometry,
  CircleGeometry,
  Color,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  ShapeGeometry,
  RepeatWrapping,
  Shape,
} from 'three';
import { clothColour, clothTexture, leatherTexture, netTexture, woodTexture } from './textures';

/** Visual dimensions of the table around the playfield (metres). */
export const CUSHION_WIDTH = TABLE_TRIM.cushionWidth;
export const RAIL_WIDTH = TABLE_TRIM.railWidth;

export interface TableView {
  group: Group;
  /** Height of the top of the wooden rail. */
  railTop: number;
  /** Where potted balls come to rest at the bottom of each pocket's well. */
  pocketRest: Map<string, Vec2>;
  outer: { hx: number; hy: number };
  dispose(): void;
}

/**
 * The inner outline of the cushions, walking anticlockwise around the table: along each rail, then
 * into each pocket along one jaw (knuckle, facing), round the back of the pocket and out along the
 * other jaw. It comes from the same segments the physics uses, so what you see is what the balls hit.
 */
function innerOutline(geo: TableGeometry): Vec2[] {
  const angle = (p: Vec2) => Math.atan2(p.y, p.x);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const pockets = [...geo.pockets].sort((a, b) => angle(a.position) - angle(b.position));
  const pts: Vec2[] = [];
  for (const p of pockets) {
    const jaw = (i: number) => geo.segments.filter((s) => s.id.startsWith(`jaw:${p.id}:${i}:`));
    const j0 = jaw(0);
    const j1 = jaw(1);
    if (!j0.length || !j1.length) continue;
    // Path from tip 0 along its jaw, round the far side of the hole (so no cushion shows inside
    // it), and back out along jaw 1.
    const end0 = j0[j0.length - 1]!.b;
    const end1 = j1[j1.length - 1]!.b;
    const path: Vec2[] = [
      ...j0.map((s) => s.a),
      end0,
      ...arcAround(p.position, backRadius(geo, p.id) + 0.001, end0, end1, p.axis),
      ...[...j1].reverse().map((s) => s.a),
    ];
    // Walk anticlockwise: start from whichever tip comes first going round the table.
    const phi = angle(p.position);
    const first = wrap(angle(path[0]!) - phi);
    const last = wrap(angle(path[path.length - 1]!) - phi);
    pts.push(...(first < last ? path : path.reverse()));
  }
  return pts;
}

const TAU = Math.PI * 2;

/** Depth of the pocket wells below the slate. */
export const WELL_DEPTH = 0.16;

/** Radius of the back of the pocket (the physics closes the pocket with an arc this far from its centre). */
function backRadius(geo: TableGeometry, pocketId: string): number {
  const p = geo.pockets.find((x) => x.id === pocketId)!;
  const back = geo.segments.filter((s) => s.id.startsWith(`back:${pocketId}:`));
  const q = back[0]?.a ?? p.position;
  return Math.hypot(q.x - p.position.x, q.y - p.position.y) || p.fallRadius;
}

const LIP_RADIUS = 0.005;

/** A strip of cloth curving down over the slate edge, from the edge into the hole. */
function clothLip(edge: Vec2[], centre: Vec2, material: MeshStandardMaterial): Mesh {
  const steps = 5;
  const pos: number[] = [];
  const idx: number[] = [];
  edge.forEach((e, i) => {
    const dx = centre.x - e.x;
    const dy = centre.y - e.y;
    const l = Math.hypot(dx, dy);
    const nx = dx / l;
    const ny = dy / l;
    for (let k = 0; k <= steps; k++) {
      const phi = ((k / steps) * Math.PI) / 2;
      const out = LIP_RADIUS * Math.sin(phi);
      pos.push(e.x + nx * out, e.y + ny * out, -LIP_RADIUS * (1 - Math.cos(phi)));
    }
    if (i > 0) {
      for (let k = 0; k < steps; k++) {
        const a = (i - 1) * (steps + 1) + k;
        const b = i * (steps + 1) + k;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const lipMat = material.clone();
  lipMat.side = DoubleSide;
  return new Mesh(g, lipMat);
}

const mod = (a: number) => ((a % TAU) + TAU) % TAU;

/** Points on a circle from the direction of `from` to the direction of `to`, passing `through`. */
function arcAround(c: Vec2, r: number, from: Vec2, to: Vec2, through: Vec2, steps = 24): Vec2[] {
  const a0 = Math.atan2(from.y - c.y, from.x - c.x);
  const a1 = Math.atan2(to.y - c.y, to.x - c.x);
  const at = Math.atan2(through.y, through.x);
  const pos = mod(a1 - a0);
  const sweep = mod(at - a0) < pos ? pos : pos - TAU;
  const pts: Vec2[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = a0 + (sweep * k) / steps;
    pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return pts;
}

/** Rectangle outline pushed outwards around each pocket so the cut-out clears the pocket hole. */
function railOutline(geo: TableGeometry, hx: number, hy: number, clearance: number): Vec2[] {
  const out: Vec2[] = [];
  const corners: [Vec2, Vec2, Vec2][] = [
    [
      { x: -hx, y: -hy },
      { x: hx, y: -hy },
      { x: 0, y: -1 },
    ],
    [
      { x: hx, y: -hy },
      { x: hx, y: hy },
      { x: 1, y: 0 },
    ],
    [
      { x: hx, y: hy },
      { x: -hx, y: hy },
      { x: 0, y: 1 },
    ],
    [
      { x: -hx, y: hy },
      { x: -hx, y: -hy },
      { x: -1, y: 0 },
    ],
  ];
  for (const [a, b, n] of corners) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.ceil(len / 0.004);
    for (let k = 0; k < steps; k++) {
      let p = { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps };
      for (const pk of geo.pockets) {
        const r = pk.fallRadius + clearance;
        const dx = p.x - pk.position.x;
        const dy = p.y - pk.position.y;
        if (dx * dx + dy * dy < r * r) {
          // Push along the outward normal until outside the circle.
          const b2 = dx * n.x + dy * n.y;
          const c2 = dx * dx + dy * dy - r * r;
          const s = -b2 + Math.sqrt(Math.max(0, b2 * b2 - c2));
          p = { x: p.x + n.x * s, y: p.y + n.y * s };
        }
      }
      out.push(p);
    }
  }
  return out;
}

const toShape = (pts: Vec2[]): Shape => new Shape(pts.map((p) => ({ x: p.x, y: p.y }) as never));
const toPath = (pts: Vec2[]): Path => new Path(pts.map((p) => ({ x: p.x, y: p.y }) as never));

export function buildTableView(table: TableSpec): TableView {
  const geo = tableGeometry(table);
  const group = new Group();
  const hl = table.playfield.length / 2;
  const hw = table.playfield.width / 2;
  const cushionTop = table.cushion.noseHeight + TABLE_TRIM.cushionTopAboveNose;
  const railTop = table.cushion.noseHeight + TABLE_TRIM.railTopAboveNose;
  const hx = hl + CUSHION_WIDTH + RAIL_WIDTH;
  const hy = hw + CUSHION_WIDTH + RAIL_WIDTH;

  // Cloth, slightly larger than the cushion line so it shows inside the pocket mouths.
  const ex = hl + CUSHION_WIDTH + 0.06;
  const ey = hw + CUSHION_WIDTH + 0.06;
  // Cloth with real holes cut at the pockets, so you can see down into them.
  const clothShape = toShape([
    { x: -ex, y: -ey },
    { x: ex, y: -ey },
    { x: ex, y: ey },
    { x: -ex, y: ey },
  ]);
  // The holes are exactly the physics drop areas: a ball over one of these falls.
  const drops = new Map(table.pockets.map((p) => [p.id, dropOutline(geo, p.id)]));
  for (const outline of drops.values()) clothShape.holes.push(toPath(outline));
  const clothGeo = new ShapeGeometry(clothShape, 32);
  const pos = clothGeo.getAttribute('position');
  const uv = clothGeo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++)
    uv.setXY(i, (pos.getX(i) + ex) / (2 * ex), (pos.getY(i) + ey) / (2 * ey));
  const cloth = new Mesh(
    clothGeo,
    new MeshStandardMaterial({ map: clothTexture(table, ex, ey), roughness: 0.92, metalness: 0 }),
  );
  group.add(cloth);

  // Cushions: from the nose line out to the rail, covered in cloth.
  const cushionMat = new MeshStandardMaterial({
    color: new Color(clothColour(table)).multiplyScalar(0.92),
    roughness: 0.9,
  });
  const cushionOuter = railOutline(geo, hl + CUSHION_WIDTH + 0.01, hw + CUSHION_WIDTH + 0.01, 0.012);
  const cushionShape = toShape(cushionOuter.slice().reverse());
  cushionShape.holes.push(toPath(innerOutline(geo)));
  const cushions = new Mesh(
    new ExtrudeGeometry(cushionShape, { depth: cushionTop, bevelEnabled: false }),
    cushionMat,
  );
  group.add(cushions);

  // Wooden rails with cut-outs around the pockets.
  const wood = woodTexture();
  wood.wrapS = wood.wrapT = RepeatWrapping;
  wood.repeat.set(4, 4);
  const woodMat = new MeshStandardMaterial({ map: wood, roughness: 0.45, metalness: 0 });
  const railShape = toShape([
    { x: -hx, y: -hy },
    { x: hx, y: -hy },
    { x: hx, y: hy },
    { x: -hx, y: hy },
  ]);
  railShape.holes.push(toPath(railOutline(geo, hl + CUSHION_WIDTH, hw + CUSHION_WIDTH, 0.012)));
  const rails = new Mesh(new ExtrudeGeometry(railShape, { depth: railTop, bevelEnabled: false }), [
    woodMat,
    woodMat,
  ]);
  group.add(rails);

  // Pockets: a hole dropping below the slate, and a liner that wraps the rail around the back of
  // the hole (open towards the table). Pool tables have black liners over a dark well; snooker
  // tables have tan leathers draped over the rail edge, brass plates and a string net.
  const snooker = table.id.startsWith('snooker');
  const linerMat = snooker
    ? new MeshStandardMaterial({ map: leatherTexture('#6f2a1e'), roughness: 0.55, metalness: 0 })
    : new MeshStandardMaterial({ color: '#111111', roughness: 0.5, metalness: 0 });
  if (snooker) {
    linerMat.map!.wrapS = linerMat.map!.wrapT = RepeatWrapping;
    linerMat.map!.repeat.set(12, 12);
  }
  const wallMat = new MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.9, side: BackSide });
  const floorMat = new MeshStandardMaterial({ color: '#151210', roughness: 1 });
  let netMat: MeshStandardMaterial | null = null;
  if (snooker) {
    const net = netTexture();
    net.wrapS = net.wrapT = RepeatWrapping;
    // One diamond about every 2cm (the side UVs are in metres).
    net.repeat.set(50, 50);
    netMat = new MeshStandardMaterial({ map: net, alphaTest: 0.4, roughness: 0.95, side: DoubleSide });
  }
  const brassMat = new MeshStandardMaterial({ color: '#c9a24a', roughness: 0.3, metalness: 0.9 });
  const hidden = new MeshBasicMaterial({ visible: false });
  const rest = new Map<string, Vec2>();
  /** Keeps a point on the table (leathers fold over the edge rather than overhanging it). */
  const onTable = (x: number, y: number): Vec2 => ({
    x: Math.max(-hx - 0.003, Math.min(hx + 0.003, x)),
    y: Math.max(-hy - 0.003, Math.min(hy + 0.003, y)),
  });
  for (const p of table.pockets) {
    const outline = drops.get(p.id)!;
    rest.set(p.id, wellCentre(outline));
    // Cloth lip: the cloth rolls over the rounded slate edge (BCA: 1/8–1/4" radius) into the hole.
    const edgeInfo = geo.drops.get(p.id);
    const edge = dropEdgePoints(geo, p.id);
    if (edgeInfo && edge.length > 1) group.add(clothLip(edge, edgeInfo.centre, cushionMat));
    // Well: the drop outline extruded down below the slate, seen from inside. On a snooker table
    // it is a string net with dark below, so balls in it show through the mesh.
    const wellShape = toShape(outline);
    const well = new Mesh(new ExtrudeGeometry(wellShape, { depth: WELL_DEPTH, bevelEnabled: false }), [
      hidden,
      wallMat,
    ]);
    well.position.z = -WELL_DEPTH;
    const floor = new Mesh(new ShapeGeometry(wellShape), floorMat);
    floor.position.z = -WELL_DEPTH + 0.001;
    group.add(well, floor);
    if (netMat) {
      // The net hangs just inside the dark well, so the dark shows between its strings.
      const inset = toShape(
        outline.map((q) => ({
          x: q.x + (rest.get(p.id)!.x - q.x) * 0.04,
          y: q.y + (rest.get(p.id)!.y - q.y) * 0.04,
        })),
      );
      const net = new Mesh(new ExtrudeGeometry(inset, { depth: WELL_DEPTH - 0.004, bevelEnabled: false }), [
        hidden,
        netMat,
      ]);
      net.position.z = -WELL_DEPTH + 0.002;
      const bottom = new Mesh(new ShapeGeometry(inset), netMat);
      bottom.position.z = -WELL_DEPTH + 0.003;
      group.add(net, bottom);
    }

    // Liner: wraps the rail round the back of the hole, open towards the table.
    const inner = backRadius(geo, p.id);
    const at = Math.atan2(p.axis.y, p.axis.x);
    const half = (115 * Math.PI) / 180;
    if (!snooker) {
      const outer = Math.max(inner + 0.032, p.fallRadius + 0.02);
      const u = new Shape();
      u.absarc(p.position.x, p.position.y, outer, at - half, at + half, false);
      u.absarc(p.position.x, p.position.y, inner, at + half, at - half, true);
      const liner = new Mesh(
        new ExtrudeGeometry(u, { depth: railTop + 0.003, bevelEnabled: false, curveSegments: 32 }),
        linerMat,
      );
      group.add(liner);
      continue;
    }
    // Snooker leather: covers the rail from the hole out to the table edge and folds down over
    // the outside of the rail as a flap.
    const outer = Math.max(
      inner + 0.05,
      Math.hypot(
        Math.abs(p.axis.x) > 0.1 ? hx - Math.abs(p.position.x) : 0,
        Math.abs(p.axis.y) > 0.1 ? hy - Math.abs(p.position.y) : 0,
      ) + 0.02,
    );
    const pts: Vec2[] = [];
    const n = 40;
    // The outer edge spans less than the liner round the hole, so the leather tapers along the rails.
    const span = p.kind === 'corner' ? (75 * Math.PI) / 180 : half;
    for (let i = 0; i <= n; i++) {
      const a = at - span + (2 * span * i) / n;
      pts.push(onTable(p.position.x + Math.cos(a) * outer, p.position.y + Math.sin(a) * outer));
    }
    for (let i = n; i >= 0; i--) {
      const a = at - half + (2 * half * i) / n;
      pts.push({ x: p.position.x + Math.cos(a) * inner, y: p.position.y + Math.sin(a) * inner });
    }
    // Clamping puts runs of identical points at the table corner, which the triangulator mishandles.
    const shape = pts.filter((q, i) => {
      const r = pts[(i + pts.length - 1) % pts.length]!;
      return Math.hypot(q.x - r.x, q.y - r.y) > 1e-5;
    });
    const flap = 0.075;
    const leather = new Mesh(
      new ExtrudeGeometry(toShape(shape), { depth: railTop + 0.004 + flap, bevelEnabled: false }),
      linerMat,
    );
    leather.position.z = -flap;
    group.add(leather);
    // Brass plates either side of the leather, on the rail top.
    for (const side of [-1, 1]) {
      const a = at + side * (half - 0.08);
      const r = (inner + Math.min(outer, inner + 0.07)) / 2;
      const plate = new Mesh(new BoxGeometry(0.045, 0.018, 0.003), brassMat);
      const c = onTable(p.position.x + Math.cos(a) * r, p.position.y + Math.sin(a) * r);
      plate.position.set(c.x, c.y, railTop + 0.003);
      plate.rotation.z = a + Math.PI / 2;
      group.add(plate);
    }
  }

  // Body: a wooden apron round the edge down to below the pocket wells, then the base.
  const bodyMat = new MeshStandardMaterial({ color: '#2b170c', roughness: 0.6 });
  const apronShape = toShape([
    { x: -hx, y: -hy },
    { x: hx, y: -hy },
    { x: hx, y: hy },
    { x: -hx, y: hy },
  ]);
  apronShape.holes.push(
    toPath([
      { x: -hx + 0.012, y: -hy + 0.012 },
      { x: hx - 0.012, y: -hy + 0.012 },
      { x: hx - 0.012, y: hy - 0.012 },
      { x: -hx + 0.012, y: hy - 0.012 },
    ]),
  );
  const apron = new Mesh(new ExtrudeGeometry(apronShape, { depth: 0.18, bevelEnabled: false }), bodyMat);
  apron.position.z = -0.18;
  const base = new Mesh(new BoxGeometry(2 * hx, 2 * hy, 0.2), bodyMat);
  base.position.z = -0.18 - 0.1;
  group.add(apron, base);

  // Sights (diamonds) on the rails of pool tables.
  if (!table.id.startsWith('snooker')) {
    const sightMat = new MeshStandardMaterial({ color: '#efe6cf', roughness: 0.3 });
    const sightGeo = new CircleGeometry(0.006, 16);
    const rx = hl + CUSHION_WIDTH + RAIL_WIDTH / 2;
    const ry = hw + CUSHION_WIDTH + RAIL_WIDTH / 2;
    const add = (x: number, y: number) => {
      const m = new Mesh(sightGeo, sightMat);
      m.position.set(x, y, railTop + 0.0005);
      group.add(m);
    };
    for (let i = 1; i < 8; i++) {
      if (i === 4) continue;
      const x = -hl + (i * table.playfield.length) / 8;
      add(x, ry);
      add(x, -ry);
    }
    for (let i = 1; i < 4; i++) {
      const y = -hw + (i * table.playfield.width) / 4;
      add(rx, y);
      add(-rx, y);
    }
  }

  // Floor.
  const floor = new Mesh(
    new PlaneGeometry(30, 30),
    new MeshStandardMaterial({ color: '#16110d', roughness: 1 }),
  );
  floor.position.z = -0.8;
  group.add(floor);

  return {
    group,
    railTop,
    pocketRest: rest,
    outer: { hx, hy },
    dispose() {
      group.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            (m as MeshStandardMaterial).map?.dispose();
            m.dispose();
          }
        }
      });
    },
  };
}
