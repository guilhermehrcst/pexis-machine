import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPexisMemoryModule } from './PexisMemoryModule';

function renderables(root: THREE.Object3D): THREE.Object3D[] {
  const result: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points ||
      object instanceof THREE.Sprite
    ) result.push(object);
  });
  return result;
}

describe('Pexis Memory Module', () => {
  it('preserves RAM identity and publishes stable semantic parts and anchors', () => {
    const { component } = buildPexisMemoryModule();
    expect(component.id).toBe('ram');
    expect(component.kind).toBe('memory');
    expect([...component.parts.keys()]).toEqual([
      'slot', 'pcb', 'dram-packages', 'contacts', 'chassis', 'activity-edge',
    ]);
    expect(component.getPart('slot')?.anchor?.name).toBe('anchor.fabric-port');
    expect(component.getPart('pcb')?.anchor?.name).toBe('anchor.memory-carrier');
    expect(component.getPart('dram-packages')?.anchor?.name).toBe('anchor.memory-packages');
    expect(component.getPart('contacts')?.anchor?.name).toBe('anchor.memory-contacts');
    expect(component.getPart('chassis')?.anchor?.name).toBe('anchor.memory-chassis');
  });

  it('instantiates repeated visual geometry within a seven-renderable budget', () => {
    const { component } = buildPexisMemoryModule();
    const objects = renderables(component.root);
    expect(objects).toHaveLength(7);
    const instanced = objects.filter((object): object is THREE.InstancedMesh => object instanceof THREE.InstancedMesh);
    expect(instanced.map((mesh) => mesh.count).sort((a, b) => a - b)).toEqual([4, 16, 48]);
  });

  it('distributes package details over both faces', () => {
    const { component } = buildPexisMemoryModule();
    const object = component.getPart('dram-packages')?.objects[0];
    expect(object).toBeInstanceOf(THREE.InstancedMesh);
    if (!(object instanceof THREE.InstancedMesh)) throw new Error('Missing package instances');
    const transform = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const front: number[] = [];
    const back: number[] = [];
    for (let i = 0; i < object.count; i += 1) {
      object.getMatrixAt(i, transform);
      position.setFromMatrixPosition(transform);
      (position.z > 0 ? front : back).push(position.x);
    }
    expect(front).toHaveLength(8);
    expect(back).toHaveLength(8);
    expect(front).toEqual(back);
  });

  it('does not hide complete parts inside other geometry or below the platform', () => {
    const { component } = buildPexisMemoryModule();
    component.root.updateMatrixWorld(true);

    // InstancedMesh.getBoundingBox() encloses the ENTIRE fleet of repeated
    // objects. It must not be used to infer one solid object: e.g. rails at
    // both outer ends have an aggregate AABB spanning the empty middle,
    // falsely "enclosing" detail that is visible between the rails.
    // Inspect every actual primitive instance instead.
    const instances: Array<{ name: string; box: THREE.Box3 }> = [];
    for (const mesh of renderables(component.root)) {
      if (!(mesh instanceof THREE.Mesh)) continue;
      mesh.geometry.computeBoundingBox();
      const geometryBounds = mesh.geometry.boundingBox;
      if (!geometryBounds) throw new Error('Missing geometry bounds: ' + mesh.name);

      if (mesh instanceof THREE.InstancedMesh) {
        const local = new THREE.Matrix4();
        for (let i = 0; i < mesh.count; i += 1) {
          mesh.getMatrixAt(i, local);
          const world = mesh.matrixWorld.clone().multiply(local);
          instances.push({
            name: mesh.name + '[' + i + ']',
            box: geometryBounds.clone().applyMatrix4(world),
          });
        }
      } else {
        instances.push({
          name: mesh.name,
          box: geometryBounds.clone().applyMatrix4(mesh.matrixWorld),
        });
      }
    }

    const eps = 0.004;
    for (const part of instances) {
      expect(part.box.min.y, part.name + ' below platform').toBeGreaterThanOrEqual(-eps);
      for (const other of instances) {
        if (part === other) continue;
        const fullyHidden = other.box.clone().expandByScalar(eps).containsBox(part.box);
        expect(fullyHidden, part.name + ' enclosed by ' + other.name).toBe(false);
      }
    }
  });

  it('starts with no fake memory activity', () => {
    const { component, activityMaterial, width, height } = buildPexisMemoryModule();
    expect(width).toBe(2.72);
    expect(height).toBeGreaterThan(1);
    expect(activityMaterial.emissiveIntensity).toBe(0);
    const strip = component.getPart('activity-edge')?.objects[0];
    expect(strip).toBeInstanceOf(THREE.Mesh);
    expect((strip as THREE.Mesh).material).toBe(activityMaterial);
  });
});
