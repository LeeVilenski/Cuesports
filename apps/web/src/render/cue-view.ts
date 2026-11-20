import { type ShotInput } from '@cuesports/physics';
import { Group, Quaternion, Vector3 } from 'three';
import { buildCue, tracker, type CueStyle } from './equipment';

/**
 * The cue. Built along +y with the tip at the origin, then aligned to the shot: the tip sits on the
 * cue ball at the chosen tip offset, pulled back by `gap`.
 */
export class CueView {
  readonly group = new Group();
  private stick: Group;
  private kit = tracker();

  constructor() {
    this.stick = buildCue(this.kit);
    this.group.add(this.stick);
  }

  /** Rebuilds the cue in a new style (the player's own), keeping its pose. */
  setStyle(style: CueStyle): void {
    const old = this.stick;
    this.kit.dispose();
    this.kit = tracker();
    this.stick = buildCue(this.kit, style);
    this.stick.position.copy(old.position);
    this.stick.quaternion.copy(old.quaternion);
    this.group.remove(old);
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
