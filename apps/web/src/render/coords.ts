import { Group, Vector3 } from 'three';

/**
 * The physics uses x along the table, y across and z up. Three.js uses y up. Everything on the
 * table lives in a group rotated −90° about x, so inside it physics coordinates can be used as-is
 * (and ball quaternions copy straight across).
 */
export function physicsGroup(): Group {
  const g = new Group();
  g.rotation.x = -Math.PI / 2;
  return g;
}

/** Physics (x, y, z) → world. */
export const toWorld = (x: number, y: number, z: number, out = new Vector3()): Vector3 => out.set(x, z, -y);

/** World → physics (x, y, z). */
export const toPhysics = (v: Vector3): { x: number; y: number; z: number } => ({ x: v.x, y: -v.z, z: v.y });
