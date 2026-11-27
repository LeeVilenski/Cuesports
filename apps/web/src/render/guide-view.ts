import { BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, LineLoop } from 'three';
import type { Guide, GuideShape } from '../game/guide';

const Z = 0.0015;

/** Thin lines on the cloth: cue-ball path, ghost ball, object-ball direction and tangent line. */
export class GuideView {
  readonly group = new Group();
  private readonly path = this.line('#ffffff', 0.75);
  private readonly ghost = new LineLoop(
    new BufferGeometry(),
    new LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }),
  );
  private readonly object = this.line('#f2c14e', 0.9);
  private readonly tangent = this.line('#9fd3ff', 0.5);

  constructor() {
    this.group.add(this.ghost);
    this.group.renderOrder = 2;
  }

  private line(color: string, opacity: number): Line {
    const l = new Line(
      new BufferGeometry(),
      new LineBasicMaterial({ color, transparent: true, opacity, depthTest: true }),
    );
    this.group.add(l);
    return l;
  }

  private set(l: Line, pts: number[]): void {
    l.geometry.setAttribute('position', new Float32BufferAttribute(pts, 3));
    l.geometry.computeBoundingSphere();
    l.visible = pts.length > 0;
  }

  /**
   * Draws a guide. With a shape (career matches) the object-ball and cue-ball lines are the ones
   * your Vision allows, and may be missing or carry on past a cushion.
   */
  update(g: Guide | null, shape?: GuideShape): void {
    this.group.visible = g !== null;
    if (!g) return;
    this.set(this.path, [g.from.x, g.from.y, Z, g.end.x, g.end.y, Z]);
    if (g.ghost) {
      const pts: number[] = [];
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        pts.push(g.ghost.x + Math.cos(a) * g.radius, g.ghost.y + Math.sin(a) * g.radius, Z);
      }
      this.ghost.geometry.setAttribute('position', new Float32BufferAttribute(pts, 3));
      this.ghost.visible = true;
    } else this.ghost.visible = false;
    if (shape) {
      const flat = (pts: { x: number; y: number }[]) => pts.flatMap((p) => [p.x, p.y, Z]);
      this.set(this.object, flat(shape.object));
      this.set(this.tangent, flat(shape.cue));
      return;
    }
    if (g.object) {
      const { from, dir } = g.object;
      this.set(this.object, [from.x, from.y, Z, from.x + dir.x * 0.35, from.y + dir.y * 0.35, Z]);
    } else this.set(this.object, []);
    if (g.ghost && g.tangent) {
      const { ghost, tangent } = g;
      this.set(this.tangent, [
        ghost.x,
        ghost.y,
        Z,
        ghost.x + tangent.x * 0.25,
        ghost.y + tangent.y * 0.25,
        Z,
      ]);
    } else this.set(this.tangent, []);
  }
}
