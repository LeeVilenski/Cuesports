import { MathUtils, OrthographicCamera, PerspectiveCamera, Vector3, type Camera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { TableSpec, Vec2 } from '@cuesports/shared';
import { toWorld } from './coords';

export type CameraMode = 'aim' | 'top' | 'free';

const tmp = new Vector3();

/**
 * Aim cam (behind the cue ball, pinch/scroll to zoom, two-finger drag to pitch), orthographic
 * top-down (rotated in portrait) and a free orbit camera. The aim cam turns with the aim instantly
 * and eases everything else, so aiming feels direct but cuts never jump.
 */
export class CameraRig {
  mode: CameraMode = 'aim';
  readonly persp = new PerspectiveCamera(45, 1, 0.01, 60);
  readonly ortho = new OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  readonly orbit: OrbitControls;
  /** Distance from the cue ball, metres. */
  distance = 1.05;
  /** Pitch above the table, degrees. */
  pitch = 13;
  /** During a shot the aim cam can rise to an overview. */
  overview = false;
  private aspect = 1;
  private eye = new Vector3(0, 2, 2);
  private look = new Vector3();
  private snapNext = true;

  constructor(
    dom: HTMLElement,
    private table: TableSpec,
  ) {
    this.orbit = new OrbitControls(this.persp, dom);
    this.orbit.enabled = false;
    this.orbit.enableDamping = true;
    this.orbit.maxPolarAngle = Math.PI * 0.48;
    this.orbit.minDistance = 0.3;
    this.orbit.maxDistance = 8;
  }

  get camera(): Camera {
    return this.mode === 'top' ? this.ortho : this.persp;
  }

  get portrait(): boolean {
    return this.aspect < 1;
  }

  setTable(table: TableSpec): void {
    this.table = table;
    this.resize(this.aspect);
    this.snapNext = true;
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    if (mode === 'free') {
      // Start orbiting from wherever the aim cam is.
      this.orbit.target.copy(this.look);
      this.persp.position.copy(this.eye);
    }
    this.mode = mode;
    this.orbit.enabled = mode === 'free';
    if (mode === 'aim') this.snapNext = false;
  }

  snap(): void {
    this.snapNext = true;
  }

  resize(aspect: number): void {
    this.aspect = aspect;
    // In portrait a wider vertical field of view keeps the object ball and pocket in shot.
    this.persp.fov = aspect < 1 ? 62 : 42;
    this.persp.aspect = aspect;
    this.persp.updateProjectionMatrix();
    const L = this.table.playfield.length + 0.4;
    const W = this.table.playfield.width + 0.4;
    // Portrait shows the table vertically.
    const [sw, sh] = aspect < 1 ? [W, L] : [L, W];
    const half = Math.max(sh / 2, sw / 2 / aspect) * 1.02;
    this.ortho.left = -half * aspect;
    this.ortho.right = half * aspect;
    this.ortho.top = half;
    this.ortho.bottom = -half;
    this.ortho.position.set(0, 6, 0);
    this.ortho.up.copy(aspect < 1 ? new Vector3(1, 0, 0) : new Vector3(0, 0, -1));
    this.ortho.lookAt(0, 0, 0);
    this.ortho.updateProjectionMatrix();
  }

  zoom(factor: number): void {
    if (this.mode === 'top') {
      this.ortho.zoom = MathUtils.clamp(this.ortho.zoom * factor, 1, 6);
      this.ortho.updateProjectionMatrix();
      return;
    }
    this.distance = MathUtils.clamp(this.distance / factor, 0.35, 3.2);
  }

  tilt(deg: number): void {
    this.pitch = MathUtils.clamp(this.pitch + deg, 4, 80);
  }

  /** Updates the aim camera for a cue ball at `ball` aiming along `aim`. Returns true while moving. */
  update(dt: number, ball: Vec2, R: number, aim: number): boolean {
    if (this.mode === 'free') {
      this.orbit.update(dt);
      return true;
    }
    if (this.mode === 'top') return false;
    const dir = { x: Math.cos(aim), y: Math.sin(aim) };
    let dist = this.distance;
    let pitch = this.portrait ? this.pitch + 10 : this.pitch;
    if (this.overview) {
      // During a shot, rise up and back so the whole table is in view.
      dist = Math.max(dist, 2.1);
      pitch = Math.max(pitch, 40);
    }
    const p = MathUtils.degToRad(pitch);
    // Look far enough down that the horizon sits near the top edge of the screen, so the table
    // (not the venue) fills the view at any pitch, zoom or screen shape.
    const h = dist * Math.sin(p);
    const back = dist * Math.cos(p);
    const lookDown = MathUtils.degToRad(this.persp.fov / 2) * 0.72;
    const ahead = Math.max(0.25, h / Math.tan(lookDown) - back);
    const lookAt = this.overview
      ? { x: ball.x * 0.35 + dir.x * 0.45, y: ball.y * 0.35 + dir.y * 0.45, z: 0 }
      : { x: ball.x + dir.x * ahead, y: ball.y + dir.y * ahead, z: R };
    const eye = toWorld(
      ball.x - dir.x * dist * Math.cos(p),
      ball.y - dir.y * dist * Math.cos(p),
      R + dist * Math.sin(p),
      tmp,
    ).clone();
    const look = toWorld(lookAt.x, lookAt.y, lookAt.z);
    let moving = false;
    if (this.snapNext) {
      this.eye.copy(eye);
      this.look.copy(look);
      this.snapNext = false;
    } else {
      const k = 1 - Math.exp(-dt * 5);
      moving = this.eye.distanceToSquared(eye) > 1e-8 || this.look.distanceToSquared(look) > 1e-8;
      this.eye.lerp(eye, k);
      this.look.lerp(look, k);
    }
    this.persp.position.copy(this.eye);
    this.persp.up.set(0, 1, 0);
    this.persp.lookAt(this.look);
    return moving;
  }

  /** Aim-cam yaw changes should feel direct: jump the camera with the aim instead of easing. */
  followAimInstantly(): void {
    this.snapNext = true;
  }
}
