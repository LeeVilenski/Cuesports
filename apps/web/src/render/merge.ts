import { BufferGeometry, Group, Matrix4, Mesh, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Bakes a group of meshes that never move into one mesh per material, cutting draw calls (a
 * snooker table's pockets alone are a hundred small parts). Meshes with several materials,
 * transparency or draw-order settings are left as they are. Returns the new group.
 */
export function mergeStatic(root: Object3D): Group {
  root.updateMatrixWorld(true);
  const inv = new Matrix4().copy(root.matrixWorld).invert();
  const byMaterial = new Map<Material, { key: string; geos: BufferGeometry[] }[]>();
  const keep: Object3D[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) {
      // Lines, sprites, lights and the like stay as they are.
      if (o !== root && o.type !== 'Group' && o.type !== 'Object3D') keep.push(o);
      return;
    }
    if (!o.visible || Array.isArray(m.material) || m.material.transparent || m.renderOrder !== 0) {
      keep.push(o);
      return;
    }
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(new Matrix4().multiplyMatrices(inv, m.matrixWorld));
    // Geometries only merge when they carry the same attributes.
    const key = Object.keys(g.attributes).sort().join(',');
    g.morphAttributes = {};
    const lists = byMaterial.get(m.material) ?? [];
    let list = lists.find((l) => l.key === key);
    if (!list) lists.push((list = { key, geos: [] }));
    list.geos.push(g);
    byMaterial.set(m.material, lists);
  });
  const out = new Group();
  for (const [mat, lists] of byMaterial) {
    for (const { geos } of lists) {
      const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
      for (const g of geos) if (g !== merged) g.dispose();
      if (merged) out.add(new Mesh(merged, mat));
    }
  }
  for (const o of keep) {
    const w = new Matrix4().multiplyMatrices(inv, o.matrixWorld);
    o.removeFromParent();
    w.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  // The originals' geometry is copied; free it (materials are shared with the merged meshes).
  root.traverse((o) => {
    if ((o as Mesh).isMesh && !keep.includes(o)) (o as Mesh).geometry.dispose();
  });
  return out;
}
