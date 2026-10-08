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

    // Seven renderables total, including both InstancedMesh detail groups.
    // The guard prevents decorative detail from silently becoming draw-call sprawl.
    expect(renderables).toBeLessThanOrEqual(7);
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
});
