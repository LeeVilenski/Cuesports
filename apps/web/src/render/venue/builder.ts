import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type ColorRepresentation,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rng } from '@cuesports/shared';

/**
 * Builds a room around the table from boxes, planes and cylinders, in physics coordinates (x along
 * the table, z up) with the floor at z = 0. Nothing in a room moves, so its lighting is baked into
 * vertex colours when it is built (from the room's lamps, the table's light and the shadow under
 * the table) and everything is drawn unlit and merged into one mesh per material: a full arena
 * costs a handful of draw calls and no lights.
 */

export interface TableFootprint {
  /** Half-extents of the table's outer edge. */
  hx: number;
  hy: number;
  /** Height of the rail above the floor. */
  top: number;
}

export interface PartOpts {
  color?: ColorRepresentation;
  /** A textured material from `texMat`. */
  mat?: MeshBasicMaterial;
  /** Lit from inside (lamps, screens, windows at night): not shaded. */
  glow?: boolean;
  /** Hangs from the ceiling: hidden when the camera is above it, so it never blocks the table. */
  hang?: boolean;
  /** Turn about z, radians. */
  rot?: number;
}

interface Lamp {
  p: Vector3;
  c: Color;
  range: number;
}

interface Part {
  geo: BufferGeometry;
  mat: MeshBasicMaterial;
  color: Color;
  glow: boolean;
  hang: boolean;
}

export interface BuiltRoom {
  group: Group;
  /** Shows or hides what hangs over the table for a camera at height `camZ` above the floor. */
  update(camZ: number, top: boolean): boolean;
  dispose(): void;
}

const v = new Vector3();
const n = new Vector3();
const tmpC = new Color();
const dv = new Vector3();

export class RoomBuilder {
  /** Light that reaches everything. */
  ambient = new Color(0.3, 0.3, 0.3);
  /** Extra ambient on faces that look up (and less on those that look down). */
  sky = 0.2;
  /** How dark the floor is under the table. */
  shadow = 0.7;
  private lamps: Lamp[] = [];
  private parts: Part[] = [];
  private frame = new Matrix4();
  private stack: Matrix4[] = [];
  private textures: Texture[] = [];
  private texMats = new Map<Texture, MeshBasicMaterial>();
  private readonly plain = new MeshBasicMaterial({ vertexColors: true });

  constructor(
    /** Half-length, half-width and height of the room. */
    readonly X: number,
    readonly Y: number,
    readonly H: number,
    readonly table: TableFootprint,
    readonly rng: Rng,
    /** 0.5 … 1: fewer people and props on slow devices. */
    readonly detail: number,
  ) {}

  /** A point light for the bake. */
  lamp(x: number, y: number, z: number, color: ColorRepresentation, power: number, range: number): void {
    this.lamps.push({
      p: new Vector3(x, y, z).applyMatrix4(this.frame),
      c: new Color(color).multiplyScalar(power),
      range,
    });
  }

  /** A canvas texture, drawn once. */
  tex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): Texture {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!, w, h);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    this.textures.push(t);
    return t;
  }

  /** A repeating texture: `size` metres per tile. */
  tile(t: Texture, sx: number, sy = sx): Texture {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.userData.tile = [sx, sy];
    return t;
  }

  texMat(t: Texture, transparent = false): MeshBasicMaterial {
    let m = this.texMats.get(t);
    if (!m) {
      m = new MeshBasicMaterial({
        vertexColors: true,
        map: t,
        transparent,
        alphaTest: transparent ? 0.4 : 0,
      });
      this.texMats.set(t, m);
    }
    return m;
  }

  // ---------------------------------------------------------------------------------------------
  // Frames: positions are given in the current frame, which these move and turn.

  push(x: number, y: number, rot = 0, z = 0): void {
    this.stack.push(this.frame.clone());
    this.frame.multiply(new Matrix4().makeRotationZ(rot).setPosition(x, y, z));
  }

  pop(): void {
    this.frame = this.stack.pop() ?? new Matrix4();
  }

  /**
   * A frame on one wall: x along the wall (left to right seen from the room), y out into the
   * room, z up, origin on the floor at the middle of the wall.
   */
  onWall(side: Side, fn: (len: number) => void): void {
    const [x, y, rot] =
      side === 'S'
        ? [0, -this.Y, 0]
        : side === 'N'
          ? [0, this.Y, Math.PI]
          : side === 'W'
            ? [-this.X, 0, -Math.PI / 2]
            : [this.X, 0, Math.PI / 2];
    this.push(x, y, rot);
    fn(side === 'S' || side === 'N' ? 2 * this.X : 2 * this.Y);
    this.pop();
  }

  /** A frame facing the table from one side: x along that side, y away from the table, origin `dist` out. */
  facing(side: Side, dist: number, fn: () => void): void {
    const [x, y, rot] =
      side === 'S'
        ? [0, -dist, Math.PI]
        : side === 'N'
          ? [0, dist, 0]
          : side === 'W'
            ? [-dist, 0, Math.PI / 2]
            : [dist, 0, -Math.PI / 2];
    this.push(x, y, rot);
    fn();
    this.pop();
  }

  // ---------------------------------------------------------------------------------------------
  // Shapes

  add(geo: BufferGeometry, o: PartOpts = {}): void {
    geo.applyMatrix4(this.frame);
    // Tiled textures: UVs in metres along the surface, so tiles keep their size on any part.
    const tile = o.mat?.map?.userData.tile as [number, number] | undefined;
    if (tile) {
      const uv = geo.getAttribute('uv') as BufferAttribute;
      const span = (geo.userData.span as [number, number] | undefined) ?? [1, 1];
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, (uv.getX(i) * span[0]) / tile[0], (uv.getY(i) * span[1]) / tile[1]);
    }
    this.parts.push({
      geo,
      mat: o.mat ?? this.plain,
      color: new Color(o.color ?? '#ffffff'),
      glow: !!o.glow,
      hang: !!o.hang,
    });
  }

  /** A box `w` × `d` × `h` standing on (x, y, z). */
  box(w: number, d: number, h: number, x: number, y: number, z: number, o: PartOpts = {}): void {
    const g = new BoxGeometry(w, d, h);
    g.translate(0, 0, h / 2);
    if (o.rot) g.rotateZ(o.rot);
    g.translate(x, y, z);
    this.add(g, o);
  }

  /** An upright cylinder (or cone) standing on (x, y, z). */
  cyl(
    rTop: number,
    rBottom: number,
    h: number,
    x: number,
    y: number,
    z: number,
    o: PartOpts = {},
    seg = 12,
  ): void {
    const g = new CylinderGeometry(rTop, rBottom, h, seg);
    g.rotateX(Math.PI / 2);
    g.translate(x, y, z + h / 2);
    this.add(g, o);
  }

  /** A cylinder lying along x. */
  rod(r: number, len: number, x: number, y: number, z: number, o: PartOpts = {}, seg = 8): void {
    const g = new CylinderGeometry(r, r, len, seg);
    g.rotateZ(Math.PI / 2);
    if (o.rot) g.rotateZ(o.rot);
    g.translate(x, y, z);
    this.add(g, o);
  }

  ball(r: number, x: number, y: number, z: number, o: PartOpts = {}, seg = 10): void {
    const g = new SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.7)));
    g.translate(x, y, z);
    this.add(g, o);
  }

  /** A vertical rectangle centred on (x, y, z), facing `theta` (0 = +x, π/2 = +y). */
  panel(w: number, h: number, x: number, y: number, z: number, theta: number, o: PartOpts = {}): void {
    const g = new PlaneGeometry(w, h, segs(w), segs(h));
    g.userData.span = [w, h];
    this.add(orient(g, x, y, z, theta), o);
  }

  /** A vertical half-disc (an arch top) on (x, y, z), facing `theta`. */
  arch(r: number, x: number, y: number, z: number, theta: number, o: PartOpts = {}): void {
    const g = new CircleGeometry(r, 24, 0, Math.PI);
    this.add(orient(g, x, y, z, theta), o);
  }

  /** A vertical disc centred on (x, y, z), facing `theta`. */
  disc(r: number, x: number, y: number, z: number, theta: number, o: PartOpts = {}, seg = 24): void {
    this.add(orient(new CircleGeometry(r, seg), x, y, z, theta), o);
  }

  /** A horizontal rectangle at height z, facing up (or down, for ceilings and lamp undersides). */
  flat(w: number, d: number, x: number, y: number, z: number, o: PartOpts = {}, down = false): void {
    const g = new PlaneGeometry(w, d, segs(w), segs(d));
    g.userData.span = [w, d];
    if (down) g.rotateX(Math.PI);
    if (o.rot) g.rotateZ(o.rot);
    g.translate(x, y, z);
    this.add(g, o);
  }

  /** A flat quad through four points, its front the side they run anticlockwise round. */
  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, o: PartOpts = {}, split = 1): void {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= split; i++) {
      const t = i / split;
      const p = a.clone().lerp(b, t);
      const q = d.clone().lerp(c, t);
      pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
      uv.push(t, 0, t, 1);
      if (i < split) {
        const k = i * 2;
        idx.push(k, k + 2, k + 3, k, k + 3, k + 1);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.userData.span = [a.distanceTo(b), a.distanceTo(d)];
    this.add(g, o);
  }

  // ---------------------------------------------------------------------------------------------
  // Bake and merge

  private light(p: Vector3, nrm: Vector3, out: Color): Color {
    const t = this.table;
    // Under the table: in its shadow, softening out past its edge.
    let shade = 1;
    if (p.z < t.top - 0.03) {
      const inside = Math.min(t.hx - Math.abs(p.x), t.hy - Math.abs(p.y));
      const s = Math.min(1, Math.max(0, inside / 0.45 + 0.55));
      shade = 1 - this.shadow * s;
    }
    const up = 1 + this.sky * nrm.z;
    // Walls darken a little towards the floor.
    const foot = Math.abs(nrm.z) < 0.5 ? 0.78 + 0.22 * Math.min(1, p.z / 0.6) : 1;
    const k = up * foot * (0.55 + 0.45 * shade);
    out.setRGB(this.ambient.r * k, this.ambient.g * k, this.ambient.b * k);
    for (const l of this.lamps) {
      dv.subVectors(l.p, p);
      const d2 = dv.lengthSq();
      const d = Math.sqrt(d2) || 1;
      const ndl = nrm.dot(dv) / d;
      const w = Math.max(0, ndl * 0.85 + 0.15);
      if (w <= 0) continue;
      const att = (w * shade * foot) / (1 + d2 / (l.range * l.range));
      out.r += l.c.r * att;
      out.g += l.c.g * att;
      out.b += l.c.b * att;
    }
    return out;
  }

  build(): BuiltRoom {
    const groups = new Map<string, { mat: MeshBasicMaterial; hang: number | null; geos: BufferGeometry[] }>();
    for (const part of this.parts) {
      const g = part.geo;
      const pos = g.getAttribute('position') as BufferAttribute;
      const nrm = g.getAttribute('normal') as BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      let minZ = Infinity;
      let x0 = Infinity,
        x1 = -Infinity,
        y0 = Infinity,
        y1 = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        minZ = Math.min(minZ, v.z);
        x0 = Math.min(x0, v.x);
        x1 = Math.max(x1, v.x);
        y0 = Math.min(y0, v.y);
        y1 = Math.max(y1, v.y);
        if (part.glow) tmpC.copy(part.color);
        else {
          n.fromBufferAttribute(nrm, i);
          this.light(v, n, tmpC).multiply(part.color);
        }
        col[i * 3] = tmpC.r;
        col[i * 3 + 1] = tmpC.g;
        col[i * 3 + 2] = tmpC.b;
      }
      g.setAttribute('color', new BufferAttribute(col, 3));
      g.deleteAttribute('normal');
      for (const k of Object.keys(g.attributes))
        if (!['position', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
      if (!g.getAttribute('uv'))
        g.setAttribute('uv', new BufferAttribute(new Float32Array(pos.count * 2), 2));
      // Hanging parts over the table (or near it) are grouped by the height they hang down to, to
      // the nearest 10 cm. Those elsewhere (over the other tables, say) can stay up.
      const m = 0.8;
      const t = this.table;
      const over = x0 < t.hx + m && x1 > -t.hx - m && y0 < t.hy + m && y1 > -t.hy - m;
      const hang = part.hang && over ? Math.floor(minZ * 10) / 10 : null;
      const key = `${part.mat.uuid}:${hang}`;
      let entry = groups.get(key);
      if (!entry) groups.set(key, (entry = { mat: part.mat, hang, geos: [] }));
      entry.geos.push(g.index ? g.toNonIndexed() : g);
      if (g.index) g.dispose();
    }
    const group = new Group();
    group.name = 'room';
    const hanging: { mesh: Mesh; at: number }[] = [];
    for (const { mat, hang, geos } of groups.values()) {
      const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
      if (!merged) continue;
      for (const g of geos) if (g !== merged) g.dispose();
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, mat);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      if (hang !== null) hanging.push({ mesh, at: hang });
    }
    const materials = new Set([this.plain, ...this.texMats.values()]);
    const textures = this.textures;
    return {
      group,
      update(camZ: number, top: boolean): boolean {
        let changed = false;
        for (const h of hanging) {
          const show = !top && camZ < h.at - 0.02;
          if (h.mesh.visible !== show) {
            h.mesh.visible = show;
            changed = true;
          }
        }
        return changed;
      },
      dispose() {
        group.traverse((o) => {
          if (o instanceof Mesh) o.geometry.dispose();
        });
        for (const m of materials) m.dispose();
        for (const t of textures) t.dispose();
      },
    };
  }
}

export type Side = 'N' | 'S' | 'E' | 'W';

const segs = (len: number): number => Math.max(1, Math.min(40, Math.ceil(len / 0.6)));

/** Stands a geometry made in the xy plane (facing +z) upright at (x, y, z), facing `theta`. */
function orient(g: BufferGeometry, x: number, y: number, z: number, theta: number): BufferGeometry {
  const m = new Matrix4().makeBasis(
    new Vector3(-Math.sin(theta), Math.cos(theta), 0),
    new Vector3(0, 0, 1),
    new Vector3(Math.cos(theta), Math.sin(theta), 0),
  );
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}
