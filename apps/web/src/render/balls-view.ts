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
} from 'three';
import { ballTexture, shadowTexture } from './textures';

interface BallMesh {
  id: string;
  mesh: Mesh;
  shadow: Mesh;
  radius: number;
}

/** How a ball potted during a shot falls into the well. */
interface Fall {
  /** Time it was potted, and where (centre position, how far it had already sunk). */
  t: number;
  from: Vec2;
  sunk: number;
  pocket: string;
  slot: number;
}

const qa = new Quaternion();
const qb = new Quaternion();
const G = 9.81;
/** Most balls shown stacked in one pocket's well. */
const MAX_STACK = 3;

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

  setPockets(rest: Map<string, Vec2>, wellDepth: number): void {
    this.rest = rest;
    this.wellDepth = wellDepth;
  }

  setBalls(balls: readonly BallState[]): void {
    for (const b of this.balls) {
      b.mesh.geometry.dispose();
      (b.mesh.material as MeshPhysicalMaterial).dispose();
      b.shadow.geometry.dispose();
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
      return { id: s.id, mesh, shadow, radius: s.radius };
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
      if (fall && t >= fall.t) {
        this.animateFall(bm, fall, t - fall.t);
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
      this.place(bm, x, y, bm.radius + sunk, sunk > -bm.radius);
    });
  }

  /** Finds the balls this shot pots: when, where they were, and which slot of the well they take. */
  private fallsFor(result: ShotResult): Map<number, Fall> {
    const cached = this.falls.get(result);
    if (cached) return cached;
    const out = new Map<number, Fall>();
    const fr = result.frames;
    const shot: { i: number; t: number; pocket: string }[] = [];
    result.ids.forEach((_, i) => {
      if (fr[0]!.pocketed[i] === 1) return;
      const k = fr.findIndex((f) => f.pocketed[i] === 1);
      const pocket = result.final[i]?.pocket;
      if (k < 0 || !pocket) return;
      shot.push({ i, t: fr[k]!.t, pocket });
    });
    shot.sort((p, q) => p.t - q.t);
    const before = this.potted.filter((p) => !shot.some((s) => result.ids[s.i] === p.id));
    for (const s of shot) {
      const k = fr.findIndex((f) => f.pocketed[s.i] === 1);
      const prev = fr[Math.max(0, k - 1)]!;
      const slot =
        before.filter((p) => p.pocket === s.pocket).length +
        shot.filter((o) => o.pocket === s.pocket && o.t < s.t).length;
      out.set(s.i, {
        t: s.t,
        from: { x: fr[k]!.pos[2 * s.i]!, y: fr[k]!.pos[2 * s.i + 1]! },
        sunk: prev.drop[s.i]!,
        pocket: s.pocket,
        slot,
      });
    }
    this.falls.set(result, out);
    return out;
  }

  /** A potted ball keeps falling (continuing its drop) and drifts to its resting place in the well. */
  private animateFall(b: BallMesh, f: Fall, tau: number): void {
    const target = this.slotPosition(b, f.pocket, f.slot);
    if (!target) {
      this.hide(b);
      return;
    }
    // Free fall from where the physics left it, already moving down after sinking `sunk`.
    const v0 = Math.sqrt(Math.max(0, -2 * G * f.sunk));
    const z = Math.max(target.z, b.radius + f.sunk - v0 * tau - 0.5 * G * tau * tau);
    const s = Math.min(1, tau / 0.22);
    const e = s * s * (3 - 2 * s);
    this.place(b, f.from.x + (target.x - f.from.x) * e, f.from.y + (target.y - f.from.y) * e, z, true);
    b.shadow.visible = false;
  }

  private slotPosition(
    b: BallMesh,
    pocket: string,
    slot: number,
  ): { x: number; y: number; z: number } | null {
    const c = this.rest.get(pocket);
    if (!c || slot >= MAX_STACK) return null;
    // Balls stack in the well, each settling slightly to one side of the one below.
    const side = slot === 0 ? 0 : slot % 2 ? 0.25 : -0.25;
    return {
      x: c.x + side * b.radius,
      y: c.y - side * b.radius,
      z: -this.wellDepth + b.radius + slot * 1.75 * b.radius,
    };
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
  }

  private place(b: BallMesh, x: number, y: number, z: number, onTable: boolean): void {
    b.mesh.visible = true;
    b.mesh.position.set(x, y, z);
    b.shadow.visible = onTable && z > b.radius * 0.5;
    b.shadow.position.set(x, y, 0.0008);
  }
}
