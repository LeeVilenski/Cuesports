import type { BallState, ShotResult } from '@cuesports/physics';
import type { Vec2 } from '@cuesports/shared';
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  CanvasTexture,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three';
import { ballTexture, shadowTexture } from './textures';
import { alongPath, RUNNER_BALLS, runnerSlots, type Vec3 } from './snooker-pocket';
import { distanceToOutline } from './well';

interface BallMesh {
  id: string;
  mesh: Mesh;
  shadow: Mesh;
  radius: number;
  /** Colour-vision label floating over the ball (null for numbered balls and the cue ball). */
  label: Sprite | null;
}

/**
 * The label for a ball whose colour is all that tells it apart: snooker reds and colours, UK pool
 * reds and yellows. Numbered pool balls and the cue ball carry their own markings.
 */
export function ballLabel(id: string): string | null {
  if (/^red\d*$/.test(id) || /^r\d+$/.test(id)) return 'R';
  if (/^y\d+$/.test(id)) return 'Y';
  const colours: Record<string, string> = {
    yellow: 'Y',
    green: 'G',
    brown: 'Br',
    blue: 'Bl',
    pink: 'P',
    black: 'Bk',
  };
  return colours[id] ?? null;
}

function labelSprite(text: string, radius: number): Sprite | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = 'rgba(10, 14, 12, 0.82)';
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = `bold ${text.length > 1 ? 28 : 34}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  // Bigger than the ball, so it still reads from the top-down view of a full-size snooker table.
  const s = new Sprite(new SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.setScalar(radius * 2.6);
  s.renderOrder = 12;
  return s;
}

/** How a ball potted during a shot falls into the well. */
interface Fall {
  /** Last recorded frame before it was potted: time and centre position. */
  t0: number;
  p0: Vec2;
  /** Time it was potted, and where its centre was then. */
  t: number;
  from: Vec2;
  /** Time its free fall started (when its centre went over the hole, or the pot itself). */
  fallStart: number;
  pocket: string;
  slot: number;
  /** Its centre (x, y, z) every PATH_DT from t0, worked out on first use. */
  path?: Float64Array;
}

const PATH_DT = 0.001;
/** How long a potted ball's path into the well is worked out for (it has settled by then). */
const PATH_TIME = 1;

const qa = new Quaternion();
const qb = new Quaternion();
const G = 9.81;
/** Most balls shown stacked in one pocket's well. */
const MAX_STACK = 3;
/** Balls shown in a snooker pocket's net once its runners are full. */
const NET_STACK = 3;

/**
 * Ball meshes with contact shadows. Positions, rotations and how far a ball has sunk into a pocket
 * come straight from the physics; after a ball is potted it falls to the bottom of the well and
 * stays there, stacking with earlier balls.
 */
export class BallsView {
  readonly group = new Group();
  private balls: BallMesh[] = [];
  private readonly shadowTex = shadowTexture();
  private rest = new Map<string, Vec2>();
  private wellDepth = 0.16;
  /** Balls in the pockets, in the order they went in. */
  private potted: { id: string; pocket: string }[] = [];
  private falls = new WeakMap<ShotResult, Map<number, Fall>>();

  /** Outline of each pocket's hole (the slate edge, jaws and back), as cut out of the cloth. */
  private outlines = new Map<string, Vec2[]>();
  /** Show the colour-vision labels. */
  private labels = false;

  /** Snooker: where a potted ball's centre rolls along each pocket's wire runners. */
  private runners = new Map<string, Vec3[]>();

  setPockets(
    rest: Map<string, Vec2>,
    wellDepth: number,
    outlines?: Map<string, Vec2[]>,
    runners?: Map<string, Vec3[]>,
  ): void {
    this.rest = rest;
    this.wellDepth = wellDepth;
    this.outlines = outlines ?? new Map();
    this.runners = runners ?? new Map();
  }

  /**
   * Lowest the centre of a ball at (x, y) can be without cutting into the edge of a pocket's hole:
   * a ball whose centre is within a radius of the edge rests on it (rolling over the lip) rather
   * than sinking through the cloth and slate.
   */
  private edgeFloor(pocket: string, x: number, y: number, R: number): number {
    const o = this.outlines.get(pocket);
    if (!o || o.length < 2) return -Infinity;
    const d = distanceToOutline(o, x, y);
    return d < R ? Math.sqrt(R * R - d * d) : -Infinity;
  }

  /** Nearest pocket to a point, if it is near enough for its edge to matter. */
  private pocketNear(x: number, y: number): string | null {
    let best: string | null = null;
    let bd = 0.25;
    for (const [id, c] of this.rest) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bd) [best, bd] = [id, d];
    }
    return best;
  }

  /** Turns the colour-vision labels on or off. */
  setLabels(on: boolean): void {
    this.labels = on;
    for (const b of this.balls) if (b.label) b.label.visible = on && b.mesh.visible && b.shadow.visible;
  }

  setBalls(balls: readonly BallState[]): void {
    for (const b of this.balls) {
      b.mesh.geometry.dispose();
      (b.mesh.material as MeshPhysicalMaterial).dispose();
      b.shadow.geometry.dispose();
      if (b.label) {
        b.label.material.map?.dispose();
        b.label.material.dispose();
      }
    }
    this.group.clear();
    this.potted = [];
    this.balls = balls.map((s) => {
      const mesh = new Mesh(
        new SphereGeometry(s.radius, 48, 32),
        new MeshPhysicalMaterial({
          map: ballTexture(s.id),
          roughness: 0.18,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.06,
          envMapIntensity: 0.9,
        }),
      );
      const shadow = new Mesh(
        new PlaneGeometry(s.radius * 3.2, s.radius * 3.2),
        new MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }),
      );
      shadow.renderOrder = 1;
      this.group.add(mesh, shadow);
      const text = ballLabel(s.id);
      const label = text ? labelSprite(text, s.radius) : null;
      if (label) this.group.add(label);
      return { id: s.id, mesh, shadow, radius: s.radius, label };
    });
    this.showState(balls);
  }

  /** Records the balls potted by a shot, in the order they dropped. */
  commit(result: ShotResult): void {
    const falls = this.fallsFor(result);
    const order = [...falls.entries()].sort((a, b) => a[1].t - b[1].t);
    for (const [i] of order) {
      const id = result.ids[i]!;
      if (!this.potted.some((p) => p.id === id)) this.potted.push({ id, pocket: falls.get(i)!.pocket });
    }
  }

  /** Shows balls at rest: on the table, or at the bottom of the pocket they went into. */
  showState(balls: readonly BallState[]): void {
    // Forget balls that are back on the table (after an undo or re-rack).
    this.potted = this.potted.filter((p) => balls.find((b) => b.id === p.id)?.state === 'pocketed');
    for (const s of balls) {
      if (s.state === 'pocketed' && s.pocket && !this.potted.some((p) => p.id === s.id)) {
        this.potted.push({ id: s.id, pocket: s.pocket });
      }
    }
    for (const s of balls) {
      const b = this.balls.find((x) => x.id === s.id);
      if (!b) continue;
      b.mesh.quaternion.set(s.orient.x, s.orient.y, s.orient.z, s.orient.w);
      if (s.state !== 'pocketed') {
        this.place(b, s.pos.x, s.pos.y, b.radius, true);
        continue;
      }
      const entry = this.potted.find((p) => p.id === s.id);
      if (!entry) {
        this.hide(b);
        continue;
      }
      const slot = this.potted.filter((p) => p.pocket === entry.pocket).indexOf(entry);
      this.placeInWell(b, entry.pocket, slot, 1);
    }
  }

  /** Shows the balls at time t during a shot, interpolating between recorded frames. */
  showFrame(result: ShotResult, t: number): void {
    const fr = result.frames;
    let lo = 0;
    let hi = fr.length - 1;
    if (t <= fr[0]!.t) hi = 0;
    else if (t >= fr[hi]!.t) lo = hi;
    else {
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (fr[mid]!.t <= t) lo = mid;
        else hi = mid;
      }
    }
    const a = fr[lo]!;
    const b = fr[hi]!;
    const k = hi === lo ? 0 : (t - a.t) / (b.t - a.t);
    const falls = this.fallsFor(result);
    result.ids.forEach((id, i) => {
      const bm = this.balls.find((x) => x.id === id);
      if (!bm) return;
      qa.set(a.orient[4 * i]!, a.orient[4 * i + 1]!, a.orient[4 * i + 2]!, a.orient[4 * i + 3]!);
      qb.set(b.orient[4 * i]!, b.orient[4 * i + 1]!, b.orient[4 * i + 2]!, b.orient[4 * i + 3]!);
      bm.mesh.quaternion.slerpQuaternions(qa, qb, k);

      const fall = falls.get(i);
      if (fall && t >= fall.t0) {
        this.animateFall(bm, fall, t);
        return;
      }
      if (a.pocketed[i] === 1) {
        // Potted before this shot: already resting in its pocket.
        const entry = this.potted.find((p) => p.id === id);
        if (entry) {
          const slot = this.potted.filter((p) => p.pocket === entry.pocket).indexOf(entry);
          this.placeInWell(bm, entry.pocket, slot, 1);
        } else this.hide(bm);
        return;
      }
      const x = a.pos[2 * i]! + (b.pos[2 * i]! - a.pos[2 * i]!) * k;
      const y = a.pos[2 * i + 1]! + (b.pos[2 * i + 1]! - a.pos[2 * i + 1]!) * k;
      const sunk = a.drop[i]! + (b.drop[i]! - a.drop[i]!) * k;
      let z = bm.radius + sunk;
      if (sunk < 0) {
        const pocket = this.pocketNear(x, y);
        if (pocket) z = Math.max(z, this.edgeFloor(pocket, x, y, bm.radius));
      }
      this.place(bm, x, y, z, z > 0);
    });
  }

  /** Finds the balls this shot pots: when, where they were, and which slot of the well they take. */
  private fallsFor(result: ShotResult): Map<number, Fall> {
    const cached = this.falls.get(result);
    if (cached) return cached;
    const out = new Map<number, Fall>();
    const fr = result.frames;
    const shot: { i: number; t: number; pocket: string }[] = [];
    result.ids.forEach((id, i) => {
      if (fr[0]!.pocketed[i] === 1) return;
      const pocket = result.final[i]?.pocket;
      const e = result.events.find((x) => x.type === 'pocket' && x.ball === id);
      if (!pocket || !e) return;
      shot.push({ i, t: e.t, pocket });
    });
    shot.sort((p, q) => p.t - q.t);
    const before = this.potted.filter((p) => !shot.some((s) => result.ids[s.i] === p.id));
    for (const s of shot) {
      const k = fr.findIndex((f) => f.pocketed[s.i] === 1);
      if (k < 0) continue;
      const prev = fr[Math.max(0, k - 1)]!;
      const slot =
        before.filter((p) => p.pocket === s.pocket).length +
        shot.filter((o) => o.pocket === s.pocket && o.t < s.t).length;
      // The recorded sink depth is a free fall from when the centre went over the hole; carry it on
      // rather than restarting (the frame that marks the pot reports no sink at all).
      const sunk = Math.min(0, prev.drop[s.i]!);
      out.set(s.i, {
        t0: Math.min(prev.t, s.t),
        p0: { x: prev.pos[2 * s.i]!, y: prev.pos[2 * s.i + 1]! },
        t: s.t,
        from: { x: fr[k]!.pos[2 * s.i]!, y: fr[k]!.pos[2 * s.i + 1]! },
        fallStart: Math.min(prev.t, s.t) - Math.sqrt((-2 * sunk) / G),
        pocket: s.pocket,
        slot,
      });
    }
    this.falls.set(result, out);
    return out;
  }

  /**
   * A potted ball keeps falling (continuing the drop it had started over the hole) and drifts from
   * where it went in to the bottom of the well. On the way it rolls over the edge of the hole rather
   * than through it, and lands on the floor of the well or on balls already there. Where the pocket
   * has wire runners (snooker), it then drops through the ring and rolls out along them to the
   * last free place. Balls beyond what the pocket shows fall in and are then hidden.
   */
  private animateFall(b: BallMesh, f: Fall, t: number): void {
    const cap = this.capacity(f.pocket);
    if (!this.rest.get(f.pocket)) {
      this.hide(b);
      return;
    }
    if (f.slot >= cap && t - f.t > 0.4) {
      this.hide(b);
      return;
    }
    const path = (f.path ??= this.fallPath(b, f));
    const u = Math.max(0, (t - f.t0) / PATH_DT);
    const n = path.length / 3;
    const i = Math.min(n - 2, Math.floor(u));
    const k = Math.min(1, u - i);
    const at = (c: number) => path[3 * i + c]! + (path[3 * (i + 1) + c]! - path[3 * i + c]!) * k;
    this.place(b, at(0), at(1), at(2), true);
    b.shadow.visible = false;
  }

  /** How many balls a pocket shows: on its runners and in its net, or stacked in its well. */
  private capacity(pocket: string): number {
    return this.runners.has(pocket) ? RUNNER_BALLS + NET_STACK : MAX_STACK;
  }

  /** Where a ball dropping into the well heads for: its stack place, or under the ring. */
  private dropTarget(b: BallMesh, f: Fall): Vec3 {
    const runner = this.runners.get(f.pocket);
    const cap = this.capacity(f.pocket);
    if (runner && f.slot < RUNNER_BALLS) return alongPath(runner, 0);
    return this.slotPosition(b, f.pocket, Math.min(f.slot, cap - 1))!;
  }

  /** Where a falling ball is across the table at time t. */
  private fallXY(f: Fall, target: Vec2, t: number): Vec2 {
    if (t < f.t) {
      // Between the last frame on the cloth and the pot: carry on towards where it went in.
      const k = f.t > f.t0 ? (t - f.t0) / (f.t - f.t0) : 1;
      return { x: f.p0.x + (f.from.x - f.p0.x) * k, y: f.p0.y + (f.from.y - f.p0.y) * k };
    }
    const s = Math.min(1, (t - f.t) / 0.22);
    const e = s * s * (3 - 2 * s);
    return { x: f.from.x + (target.x - f.from.x) * e, y: f.from.y + (target.y - f.from.y) * e };
  }

  /**
   * Steps a falling ball (x, y, z every PATH_DT): free fall, held up by the hole's edge, the well
   * floor and the balls below; then, onto the runners, a roll out to its place.
   */
  private fallPath(b: BallMesh, f: Fall): Float64Array {
    const R = b.radius;
    const n = Math.ceil(PATH_TIME / PATH_DT) + 2;
    const out = new Float64Array(3 * n);
    const target = this.dropTarget(b, f);
    const cap = this.capacity(f.pocket);
    const below: Vec3[] = [];
    for (let k = 0; k < Math.min(f.slot, cap); k++) below.push(this.slotPosition(b, f.pocket, k)!);
    const runner = this.runners.get(f.pocket);
    const rollTo = runner && f.slot < RUNNER_BALLS ? runnerSlots(runner, R)[f.slot]! : 0;
    // The lip of the hole only holds it up while it is still level with the cloth; once below the
    // slate it is in the well.
    let onLip = true;
    const floor = (x: number, y: number): number => {
      let z = runner ? target.z : -this.wellDepth + R;
      if (onLip) z = Math.max(z, this.edgeFloor(f.pocket, x, y, R));
      for (const c of below) {
        const d2 = (x - c.x) ** 2 + (y - c.y) ** 2;
        if (d2 < 4 * R * R) z = Math.max(z, c.z + Math.sqrt(4 * R * R - d2));
      }
      return z;
    };
    const fallen = Math.max(0, f.t0 - f.fallStart);
    let z = R - 0.5 * G * fallen * fallen;
    let vz = -G * fallen;
    let xy = this.fallXY(f, target, f.t0);
    const f0 = floor(xy.x, xy.y);
    if (z < f0) [z, vz] = [f0, 0];
    out[0] = xy.x;
    out[1] = xy.y;
    out[2] = z;
    // Rolling along the runners: when it started, and how far it has gone.
    let rollStart = -1;
    let s = 0;
    let v = 0;
    for (let i = 1; i < n; i++) {
      const t = f.t0 + i * PATH_DT;
      if (rollStart >= 0) {
        // Gathers speed down the slight slope, then stops at its place.
        v = Math.min(1.4, v + 5 * PATH_DT);
        s = Math.min(rollTo, s + v * PATH_DT);
        const q = alongPath(runner!, s);
        out.set([q.x, q.y, q.z], 3 * i);
        continue;
      }
      xy = this.fallXY(f, target, t);
      vz -= G * PATH_DT;
      z += vz * PATH_DT;
      const fl = floor(xy.x, xy.y);
      if (z < fl) {
        // Resting on (or rolling over) something: it follows it down without bouncing.
        z = fl;
        vz = Math.min(0, Math.max(vz, (fl - out[3 * (i - 1) + 2]!) / PATH_DT));
      }
      out.set([xy.x, xy.y, z], 3 * i);
      if (z < 0) onLip = false;
      // Down through the ring and onto the runners once it is under it.
      if (rollTo > 0 && t >= f.t + 0.22 && z <= target.z + 1e-6) rollStart = t;
    }
    return out;
  }

  private slotPosition(b: BallMesh, pocket: string, slot: number): Vec3 | null {
    const c = this.rest.get(pocket);
    if (!c || slot >= this.capacity(pocket)) return null;
    const R = b.radius;
    const runner = this.runners.get(pocket);
    // On the runners the first ball rolls to the end stop, the next stops against it, and so on.
    const slots = runner ? runnerSlots(runner, R) : null;
    if (runner && slot < RUNNER_BALLS) return alongPath(runner, slots![slot]!);
    // Balls stack in the well (or the net, above the ball under its ring), each settling slightly to
    // one side of the one below and touching it (never overlapping it).
    const k0 = runner ? slot - RUNNER_BALLS + 1 : slot;
    const sideOf = (k: number) => (k === 0 ? 0 : k % 2 ? 0.35 : -0.35) * R;
    // In a net, the stack stands on the last ball on the runners (the one under the ring).
    const base = runner ? alongPath(runner, slots![RUNNER_BALLS - 1]!) : { ...c, z: -this.wellDepth + R };
    let z = base.z;
    for (let k = 1; k <= k0; k++) {
      const dh = Math.abs(sideOf(k) - sideOf(k - 1)) * Math.SQRT2;
      z += Math.sqrt(4 * R * R - dh * dh);
    }
    const side = sideOf(k0);
    return { x: base.x + side, y: base.y - side, z };
  }

  private placeInWell(b: BallMesh, pocket: string, slot: number, _settled: number): void {
    const p = this.slotPosition(b, pocket, slot);
    if (!p) {
      this.hide(b);
      return;
    }
    this.place(b, p.x, p.y, p.z, true);
    b.shadow.visible = false;
  }

  private hide(b: BallMesh): void {
    b.mesh.visible = false;
    b.shadow.visible = false;
    if (b.label) b.label.visible = false;
  }

  private place(b: BallMesh, x: number, y: number, z: number, onTable: boolean): void {
    b.mesh.visible = true;
    b.mesh.position.set(x, y, z);
    b.shadow.visible = onTable && z > b.radius * 0.5;
    b.shadow.position.set(x, y, 0.0008);
    if (b.label) {
      // Just above the ball, only while it's on the table.
      b.label.visible = this.labels && b.shadow.visible;
      b.label.position.set(x, y + b.radius * 1.5, z + b.radius * 2.4);
    }
  }
}
