import type { ShotInput } from '@cuesports/physics';
import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';

const LENGTH = 1.45;
const TIP_R = 0.0062;
const BUTT_R = 0.0145;

/**
 * Placeholder cue. Built along +y with the tip at the origin, then aligned to the shot: the tip sits
 * on the cue ball at the chosen tip offset, pulled back by `gap`.
 */
export class CueView {
  readonly group = new Group();
  private readonly stick = new Group();

  constructor() {
    const part = (r0: number, r1: number, len: number, y: number, color: string, rough = 0.4) => {
      const m = new Mesh(
        new CylinderGeometry(r0, r1, len, 24),
        new MeshStandardMaterial({ color, roughness: rough }),
      );
      m.position.y = y + len / 2;
      this.stick.add(m);
    };
    // Tip, ferrule, maple shaft, dark butt (radii taper linearly from tip to butt).
    const r = (y: number) => TIP_R + ((BUTT_R - TIP_R) * y) / LENGTH;
    part(TIP_R, TIP_R, 0.008, 0, '#2c5d8f', 0.9);
    part(r(0.008), r(0.028), 0.02, 0.008, '#f2efe6', 0.3);
    part(r(0.028), r(0.86), 0.832, 0.028, '#d9b98a', 0.35);
    part(r(0.86), r(0.88), 0.02, 0.86, '#111', 0.3);
    part(r(0.88), BUTT_R, LENGTH - 0.88, 0.88, '#3b1d0e', 0.3);
    this.group.add(this.stick);
  }

  /** Positions the cue for a shot on a ball at (x, y) with radius R. */
  pose(ballX: number, ballY: number, R: number, shot: ShotInput, gap: number): void {
    const ch = Math.cos(shot.aim);
    const sh = Math.sin(shot.aim);
    const ce = Math.cos(shot.elevation);
    const se = Math.sin(shot.elevation);
    const d = new Vector3(ce * ch, ce * sh, -se);
    const s = new Vector3(sh, -ch, 0);
    const e2 = new Vector3().crossVectors(s, d);
    const { a, b } = shot.tip;
    const c = Math.sqrt(Math.max(0, 1 - a * a - b * b));
    const tip = new Vector3(ballX, ballY, R)
      .addScaledVector(s, a * R)
      .addScaledVector(e2, b * R)
      .addScaledVector(d, -c * R - gap);
    this.stick.position.copy(tip);
    // Local +y runs from the tip to the butt, i.e. along −d.
    this.stick.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().negate()));
  }
}
