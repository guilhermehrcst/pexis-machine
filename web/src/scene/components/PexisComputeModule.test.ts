import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPexisComputeModule } from './PexisComputeModule';

describe('Pexis Compute Module', () => {
  it('publishes a complete semantic component with stable part ids and anchors', () => {
    const build = buildPexisComputeModule();
    const { component } = build;

    expect(component.id).toBe('cpu');
    expect(component.kind).toBe('compute');
    expect([...component.parts.keys()]).toEqual([
      'package',
      'contacts',
      'module-frame',
      'compute-tile',
      'activity-ring',
    ]);

    expect(component.getPart('package')?.anchor?.name).toBe('anchor.package');
    expect(component.getPart('contacts')?.anchor?.name).toBe('anchor.contacts');
    expect(component.getPart('module-frame')?.anchor?.name).toBe('anchor.module-frame');
    expect(component.getPart('compute-tile')?.anchor?.name).toBe('anchor.compute-tile');
    const livePort = component.root.getObjectByName('anchor.fabric-port');
    const plannedPort = component.root.getObjectByName('anchor.fabric-planned-port');
    expect(livePort?.position.x).toBeLessThan(0);
    expect(plannedPort?.position.x).toBeGreaterThan(0);
    expect(livePort?.position.z).toBeCloseTo(1.0);
    expect(plannedPort?.position.z).toBeCloseTo(1.0);
  });

  it('stays inside the M1B procedural renderable budget', () => {
    const { component } = buildPexisComputeModule();
    let renderables = 0;
    component.root.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.Points ||
        object instanceof THREE.Sprite
      ) {
        renderables += 1;
      }
    });

    // Six renderables total, including both InstancedMesh detail groups.
    // The guard prevents decorative detail from silently becoming draw-call sprawl.
    expect(renderables).toBeLessThanOrEqual(6);
  });

  it('uses instancing for repeated package details', () => {
    const { component } = buildPexisComputeModule();
    const instances: THREE.InstancedMesh[] = [];
    component.root.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) instances.push(object);
    });

    expect(instances).toHaveLength(2);
    expect(instances.map((mesh) => mesh.count).sort((a, b) => a - b)).toEqual([4, 64]);
  });

  it('has no renderable hidden inside another one or below the platform', () => {
    // Regression for the M1B review: compute.underside sat entirely inside the
    // substrate footprint and under the platform top, so it never drew a pixel.
    const { component } = buildPexisComputeModule();
    component.root.updateMatrixWorld(true);
    const boxes: Array<{ name: string; box: THREE.Box3 }> = [];
    component.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object instanceof THREE.InstancedMesh) object.computeBoundingBox();
        boxes.push({ name: object.name, box: new THREE.Box3().setFromObject(object) });
      }
    });
    const eps = 0.01;
    for (const a of boxes) {
      expect(a.box.min.y, `${a.name} reaches below the platform top`).toBeGreaterThanOrEqual(-eps);
      for (const b of boxes) {
        if (a === b) continue;
        const inside = b.box.clone().expandByScalar(eps).containsBox(a.box);
        expect(inside, `${a.name} is enclosed by ${b.name}`).toBe(false);
      }
    }
    expect(boxes.map((b) => b.name)).not.toContain('compute.underside');
  });
});
