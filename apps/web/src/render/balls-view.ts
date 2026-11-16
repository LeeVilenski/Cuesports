import type { BallState, ShotResult } from '@cuesports/physics';
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

const qa = new Quaternion();
const qb = new Quaternion();

/** Ball meshes with contact shadows. Positions and rotations come straight from the physics. */
export class BallsView {
  readonly group = new Group();
  private balls: BallMesh[] = [];
  private readonly shadowTex = shadowTexture();

  setBalls(balls: readonly BallState[]): void {
    for (const b of this.balls) {
      b.mesh.geometry.dispose();
      (b.mesh.material as MeshPhysicalMaterial).dispose();
      b.shadow.geometry.dispose();
    }
    this.group.clear();
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

  /** Shows balls at rest. */
  showState(balls: readonly BallState[]): void {
    for (const s of balls) {
      const b = this.balls.find((x) => x.id === s.id);
      if (!b) continue;
      const visible = s.state !== 'pocketed';
      this.place(b, s.pos.x, s.pos.y, visible);
      b.mesh.quaternion.set(s.orient.x, s.orient.y, s.orient.z, s.orient.w);
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
    result.ids.forEach((id, i) => {
      const bm = this.balls.find((x) => x.id === id);
      if (!bm) return;
      const pocketed = (k < 0.5 ? a : b).pocketed[i] === 1;
      const x = a.pos[2 * i]! + (b.pos[2 * i]! - a.pos[2 * i]!) * k;
      const y = a.pos[2 * i + 1]! + (b.pos[2 * i + 1]! - a.pos[2 * i + 1]!) * k;
      this.place(bm, x, y, !pocketed);
      qa.set(a.orient[4 * i]!, a.orient[4 * i + 1]!, a.orient[4 * i + 2]!, a.orient[4 * i + 3]!);
      qb.set(b.orient[4 * i]!, b.orient[4 * i + 1]!, b.orient[4 * i + 2]!, b.orient[4 * i + 3]!);
      bm.mesh.quaternion.slerpQuaternions(qa, qb, k);
    });
  }

  private place(b: BallMesh, x: number, y: number, visible: boolean): void {
    b.mesh.visible = visible;
    b.shadow.visible = visible;
    b.mesh.position.set(x, y, b.radius);
    // The canopy light is overhead, so the shadow sits slightly offset towards the viewer side.
    b.shadow.position.set(x, y, 0.0008);
  }
}
