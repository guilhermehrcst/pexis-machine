import * as THREE from 'three';

/**
 * World-space boxes of every drawn primitive under `root`, one per instance
 * for InstancedMesh. An InstancedMesh's own bounding box spans the whole
 * fleet and must not be mistaken for one solid object.
 */
export function primitiveBoxes(root: THREE.Object3D): Array<{ name: string; box: THREE.Box3 }> {
  root.updateMatrixWorld(true);
  const boxes: Array<{ name: string; box: THREE.Box3 }> = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox;
    if (!bounds) throw new Error('Missing geometry bounds: ' + object.name);
    if (object instanceof THREE.InstancedMesh) {
      const local = new THREE.Matrix4();
      for (let i = 0; i < object.count; i += 1) {
        object.getMatrixAt(i, local);
        boxes.push({ name: `${object.name}[${i}]`, box: bounds.clone().applyMatrix4(object.matrixWorld.clone().multiply(local)) });
      }
    } else {
      boxes.push({ name: object.name, box: bounds.clone().applyMatrix4(object.matrixWorld) });
    }
  });
  return boxes;
}

/** Every renderable object (meshes, lines, points, sprites) under `root`. */
export function renderables(root: THREE.Object3D): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points ||
      object instanceof THREE.Sprite
    ) objects.push(object);
  });
  return objects;
}
