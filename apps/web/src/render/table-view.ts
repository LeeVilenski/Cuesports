import { tableGeometry, type TableGeometry } from '@cuesports/physics';
import type { TableSpec, Vec2 } from '@cuesports/shared';
import {
  BackSide,
  BoxGeometry,
  CylinderGeometry,
  RingGeometry,
  CircleGeometry,
  Color,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
} from 'three';
import { clothColour, clothTexture, woodTexture } from './textures';

/** Visual dimensions of the table around the playfield (metres). */
export const CUSHION_WIDTH = 0.05;
export const RAIL_WIDTH = 0.1;

export interface TableView {
  group: Group;
  /** Height of the top of the wooden rail. */
  railTop: number;
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
    const back = geo.segments.filter((s) => s.id.startsWith(`back:${p.id}:`));
    const j0 = jaw(0);
    const j1 = jaw(1);
    if (!j0.length || !j1.length) continue;
    // Path from tip 0 round the pocket to tip 1.
    const path: Vec2[] = [
      ...j0.map((s) => s.a),
      j0[j0.length - 1]!.b,
      ...back.map((s) => s.b),
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
  const cushionTop = table.cushion.noseHeight + 0.007;
  const railTop = cushionTop + 0.006;
  const hx = hl + CUSHION_WIDTH + RAIL_WIDTH;
  const hy = hw + CUSHION_WIDTH + RAIL_WIDTH;

  // Cloth, slightly larger than the cushion line so it shows inside the pocket mouths.
  const ex = hl + CUSHION_WIDTH + 0.06;
  const ey = hw + CUSHION_WIDTH + 0.06;
  const cloth = new Mesh(
    new PlaneGeometry(2 * ex, 2 * ey),
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

  // Pocket liners: dark rings on the rail around each hole.
  const linerMat = new MeshStandardMaterial({ color: '#0d0d0d', roughness: 0.55 });
  for (const p of table.pockets) {
    const liner = new Mesh(new RingGeometry(p.fallRadius, p.fallRadius + 0.02, 40), linerMat);
    liner.position.set(p.position.x, p.position.y, railTop + 0.0006);
    group.add(liner);
    // Inside of the hole, visible from low camera angles.
    const cup = new Mesh(
      new CylinderGeometry(p.fallRadius, p.fallRadius, railTop + 0.12, 32, 1, true),
      new MeshStandardMaterial({ color: '#050505', roughness: 1, side: BackSide }),
    );
    cup.rotation.x = Math.PI / 2;
    cup.position.set(p.position.x, p.position.y, (railTop - 0.12) / 2);
    group.add(cup);
  }

  // Body under the slate.
  const body = new Mesh(
    new BoxGeometry(2 * hx, 2 * hy, 0.22),
    new MeshStandardMaterial({ color: '#2b170c', roughness: 0.6 }),
  );
  body.position.z = -0.11 - 0.001;
  group.add(body);

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
