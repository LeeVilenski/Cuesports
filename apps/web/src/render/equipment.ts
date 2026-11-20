import { CUE_SHAPE } from '@cuesports/physics';
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';

/**
 * Snooker equipment: the cue (one-piece ash, brass ferrule, a blue tip as wide as the ferrule with
 * a domed, chalked face), the rest (a brass cross on a pale shaft, rubber on its four ends) and the
 * spider (a brass arch on rubber feet, its crown notched at two heights).
 */

/** Height of the cue's axis above the table when it lies in the cross, and in the spider's centre groove. */
export const CROSS_H = 0.044;
export const SPIDER_H = 0.104;
/** Where the head is fixed to the shaft (local: x across the cue, +y towards the ball, z up). */
export const CROSS_SOCKET = { y: -0.02, z: 0.033 };
export const SPIDER_SOCKET = { y: -0.012, z: 0.088 };

const L = CUE_SHAPE.length;
const TIP_R = CUE_SHAPE.tipRadius;
const BUTT_R = CUE_SHAPE.buttRadius;

/** Disposal bookkeeping shared by the builders. */
export interface Track {
  geo<G extends BufferGeometry>(g: G): G;
  mat<M extends Material>(m: M): M;
  tex<T extends Texture>(t: T): T;
}

export function tracker(): Track & { dispose(): void } {
  const geos: BufferGeometry[] = [];
  const mats: Material[] = [];
  const texs: Texture[] = [];
  return {
    geo: (g) => (geos.push(g), g),
    mat: (m) => (mats.push(m), m),
    tex: (t) => (texs.push(t), t),
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}

/** Ash: pale, with dark grain streaks running the length of the wood (texture v = along the cue). */
function ashTexture(base: string, streak: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);
  // Seeded so every cue looks the same.
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const x0 = rnd() * c.width;
    const w = 0.6 + rnd() * (i % 5 === 0 ? 5 : 2);
    g.strokeStyle = streak;
    g.globalAlpha = 0.25 + rnd() * 0.55;
    g.lineWidth = w;
    g.beginPath();
    for (let y = 0; y <= c.height; y += 16) {
      const x = x0 + Math.sin(y / 60 + i) * 3 + (rnd() - 0.5) * 1.5;
      if (y === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** A solid of revolution along +y from (radius, y) points, ends closed. */
function lathe(points: [number, number][], segments = 20): LatheGeometry {
  const pts = points.map(([r, y]) => new Vector2(r, y));
  pts.unshift(new Vector2(1e-5, pts[0]!.y));
  pts.push(new Vector2(1e-5, pts[pts.length - 1]!.y));
  return new LatheGeometry(pts, segments);
}

export type CueWood = 'ash' | 'maple' | 'rosewood' | 'ebony';
export type CueFerrule = 'brass' | 'ivory' | 'black';

/** How a cue looks: the wood, the ferrule, and a wrap round the butt (null for none). */
export interface CueStyle {
  wood: CueWood;
  ferrule: CueFerrule;
  wrap: string | null;
}

export const DEFAULT_CUE_STYLE: CueStyle = { wood: 'ash', ferrule: 'brass', wrap: null };

/** Base and grain colours per wood. */
export const WOODS: Record<CueWood, { label: string; base: string; grain: string }> = {
  ash: { label: 'Ash', base: '#d8bf93', grain: '#5a3a1e' },
  maple: { label: 'Maple', base: '#ead6ae', grain: '#a7835a' },
  rosewood: { label: 'Rosewood', base: '#7c3d24', grain: '#2a100a' },
  ebony: { label: 'Ebony', base: '#3a2d26', grain: '#0d0907' },
};

export const FERRULES: Record<
  CueFerrule,
  { label: string; color: string; metalness: number; roughness: number }
> = {
  brass: { label: 'Brass', color: '#c9a548', metalness: 0.9, roughness: 0.25 },
  ivory: { label: 'Ivory', color: '#efe8d6', metalness: 0, roughness: 0.35 },
  black: { label: 'Black', color: '#1a1a1a', metalness: 0.2, roughness: 0.4 },
};

/** The cue, built along +y with the very end of the tip at the origin and the butt at y = length. */
export function buildCue(track: Track, style: CueStyle = DEFAULT_CUE_STYLE): Group {
  const { geo, mat } = track;
  const g = new Group();
  // Tip: a blue leather disc as wide as the ferrule, its face domed and chalked.
  const leather = mat(new MeshStandardMaterial({ color: '#3b4f7a', roughness: 0.95 }));
  const chalk = mat(new MeshStandardMaterial({ color: '#6f8fb8', roughness: 1 }));
  const TIP_LEN = 0.008;
  const DOME = 0.0018;
  const disc = new Mesh(geo(new CylinderGeometry(TIP_R, TIP_R, TIP_LEN - DOME, 20)), leather);
  disc.position.y = DOME + (TIP_LEN - DOME) / 2;
  // Dome: a spherical cap whose rim matches the tip's radius.
  const sr = (TIP_R * TIP_R + DOME * DOME) / (2 * DOME);
  const theta = Math.asin(TIP_R / sr);
  const dome = new Mesh(geo(new SphereGeometry(sr, 20, 6, 0, Math.PI * 2, 0, theta)), chalk);
  dome.rotation.x = Math.PI;
  dome.position.y = sr;
  // Ferrule.
  const FERRULE = 0.02;
  const f = FERRULES[style.ferrule];
  const fmat = mat(
    new MeshStandardMaterial({ color: f.color, roughness: f.roughness, metalness: f.metalness }),
  );
  const ferrule = new Mesh(geo(new CylinderGeometry(TIP_R * 1.01, TIP_R * 1.03, FERRULE, 20)), fmat);
  ferrule.position.y = TIP_LEN + FERRULE / 2;
  // One piece of ash from the ferrule to the butt, thickening steadily, the butt a little darker.
  const y0 = TIP_LEN + FERRULE;
  const r = (k: number) => TIP_R * 1.03 + (BUTT_R - TIP_R * 1.03) * k ** 1.35;
  const shaft: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    shaft.push([r(k), y0 + (L - y0 - 0.004) * k]);
  }
  const w = WOODS[style.wood];
  const ash = ashTexture(w.base, w.grain);
  if (ash) {
    track.tex(ash);
    ash.repeat.set(1, 3);
  }
  const wood = mat(new MeshStandardMaterial({ color: ash ? '#ffffff' : w.base, map: ash, roughness: 0.38 }));
  const body = new Mesh(geo(lathe(shaft, 24)), wood);
  // Black rubber bumper on the butt.
  const bumper = new Mesh(
    geo(new CylinderGeometry(BUTT_R * 0.95, BUTT_R * 0.9, 0.006, 20)),
    mat(new MeshStandardMaterial({ color: '#141414', roughness: 0.8 })),
  );
  bumper.position.y = L - 0.003;
  g.add(disc, dome, ferrule, body, bumper);
  // Wrap: a grip a little proud of the butt, where the back hand holds the cue.
  if (style.wrap) {
    const WRAP = [0.2, 0.47];
    const pts: [number, number][] = [];
    for (let i = 0; i <= 6; i++) {
      // k: metres from the butt end; the shaft's radius there, plus the wrap's thickness.
      const k = WRAP[0]! + ((WRAP[1]! - WRAP[0]!) * i) / 6;
      const y = L - k;
      pts.push([r((y - y0) / (L - y0 - 0.004)) + 0.0006, y]);
    }
    const wrap = new Mesh(
      geo(lathe(pts.reverse(), 24)),
      mat(new MeshStandardMaterial({ color: style.wrap, roughness: 0.85 })),
    );
    g.add(wrap);
  }
  return g;
}

const BRASS = '#c9a548';

function rubberCap(track: Track): Mesh {
  return new Mesh(
    track.geo(new CylinderGeometry(0.0055, 0.0055, 0.012, 10)),
    track.mat(new MeshStandardMaterial({ color: '#111', roughness: 0.85 })),
  );
}

/**
 * The rest's cross: a brass X standing across the cue line on its lower arms, the cue lying in the
 * upper V. Origin on the table under its centre; x across, +y towards the ball, z up.
 */
export function buildCross(track: Track): Group {
  const { geo, mat } = track;
  const brass = mat(new MeshStandardMaterial({ color: BRASS, roughness: 0.25, metalness: 0.9 }));
  const g = new Group();
  const c = CROSS_SOCKET.z;
  const ARM = 0.088;
  const bar = geo(new BoxGeometry(0.007, 0.007, ARM));
  for (const s of [-1, 1]) {
    const a = new Mesh(bar, brass);
    a.rotation.y = (s * Math.PI) / 4;
    a.position.z = c;
    g.add(a);
    // Rubber on both ends of each arm.
    const dir = new Vector3(Math.sin((s * Math.PI) / 4), 0, Math.cos((s * Math.PI) / 4));
    for (const e of [-1, 1]) {
      const cap = rubberCap(track);
      cap.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      cap.position.set(0, 0, c).addScaledVector(dir, (ARM / 2) * e);
      g.add(cap);
    }
  }
  // Socket for the shaft, behind the crossing.
  const socket = new Mesh(geo(new CylinderGeometry(0.0095, 0.011, 0.03, 14)), brass);
  socket.position.set(0, CROSS_SOCKET.y + 0.005, c);
  g.add(socket);
  return g;
}

/**
 * The spider: a brass arch on rubber feet, high enough to stand over a ball, with a crown notched
 * at two heights (the centre groove highest). Same axes as the cross; the cue lies in the centre groove.
 */
export function buildSpider(track: Track): Group {
  const { geo, mat } = track;
  const brass = mat(new MeshStandardMaterial({ color: BRASS, roughness: 0.25, metalness: 0.9 }));
  const g = new Group();
  const ARCH_R = 0.045;
  const archZ = 0.042;
  const arch = new Mesh(geo(new TorusGeometry(ARCH_R, 0.0055, 8, 24, Math.PI)), brass);
  arch.rotation.x = Math.PI / 2;
  arch.position.z = archZ;
  g.add(arch);
  for (const s of [-1, 1]) {
    // Legs straight down from the arch, splaying slightly to the feet.
    const leg = new Mesh(geo(new CylinderGeometry(0.0055, 0.0055, archZ, 10)), brass);
    leg.rotation.x = Math.PI / 2;
    leg.rotation.order = 'YXZ';
    leg.rotation.y = s * -0.12;
    leg.position.set(s * (ARCH_R + 0.0025), 0, archZ / 2);
    const foot = rubberCap(track);
    foot.rotation.x = Math.PI / 2;
    foot.position.set(s * (ARCH_R + 0.005), 0, 0.005);
    g.add(leg, foot);
  }
  // Crown on top of the arch: two outer horns, side grooves, and a higher centre groove.
  const W = 0.04;
  const base = archZ + ARCH_R - 0.004;
  const pts: [number, number][] = [
    [-W, base],
    [W, base],
    [W, base + 0.022],
    [W * 0.62, base + 0.009], // right groove (low)
    [W * 0.32, base + 0.024],
    [0, SPIDER_H - 0.006], // centre groove (high)
    [-W * 0.32, base + 0.024],
    [-W * 0.62, base + 0.009], // left groove (low)
    [-W, base + 0.022],
  ];
  const shape = new Shape(pts.map(([x, y]) => new Vector2(x, y)));
  const crownGeo = geo(new ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: false }));
  crownGeo.translate(0, 0, -0.004);
  const crown = new Mesh(crownGeo, brass);
  crown.rotation.x = Math.PI / 2;
  // Socket for the shaft at the back of the crown.
  const socket = new Mesh(geo(new CylinderGeometry(0.0095, 0.011, 0.024, 14)), brass);
  socket.position.set(0, SPIDER_SOCKET.y, SPIDER_SOCKET.z);
  g.add(crown, socket);
  return g;
}

/** A rest or spider shaft: pale wood, built along +y and centred (length 1, stretched to fit). */
export function buildRestShaft(track: Track): Mesh {
  const ash = ashTexture('#e6d3ac', '#8a6a44');
  if (ash) {
    track.tex(ash);
    ash.repeat.set(1, 2);
  }
  return new Mesh(
    track.geo(new CylinderGeometry(0.0105, 0.0115, 1, 14)),
    track.mat(new MeshStandardMaterial({ color: ash ? '#ffffff' : '#e6d3ac', map: ash, roughness: 0.45 })),
  );
}
