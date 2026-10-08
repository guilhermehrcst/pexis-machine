import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  MachineVisualRegistry,
  VisualContractError,
  createVisualComponent,
  type MachineVisualComponent,
} from './semantic';

type TestId = 'cpu' | 'ram';

function component(id: TestId = 'cpu'): MachineVisualComponent<TestId> {
  const root = new THREE.Group();
  const packageMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  const anchor = new THREE.Object3D();
  root.add(packageMesh, anchor);
  return createVisualComponent({
    id,
    kind: id === 'cpu' ? 'compute' : 'memory',
    root,
    parts: [{ id: 'package', role: 'package', objects: [packageMesh], anchor }],
  });
}

describe('semantic visual contract', () => {
  it('indexes components and parts without owning simulator state', () => {
    const registry = new MachineVisualRegistry<TestId>();
    const cpu = component();
    registry.register(cpu);

    expect(registry.size).toBe(1);
    expect(registry.getComponent('cpu')).toBe(cpu);
    expect(registry.getPart('cpu', 'package')?.role).toBe('package');
    expect(registry.getPart('cpu', 'missing')).toBeUndefined();

    registry.clear();
    expect(registry.size).toBe(0);
  });

  it('rejects duplicate component ids', () => {
    const registry = new MachineVisualRegistry<TestId>();
    registry.register(component('cpu'));
    expect(() => registry.register(component('cpu'))).toThrow(VisualContractError);
  });

  it('rejects duplicate part ids', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    root.add(a, b);

    expect(() =>
      createVisualComponent({
        id: 'cpu',
        kind: 'compute',
        root,
        parts: [
          { id: 'package', role: 'a', objects: [a] },
          { id: 'package', role: 'b', objects: [b] },
        ],
      }),
    ).toThrow(/duplicate part/);
  });

  it('rejects orphan renderables', () => {
    const root = new THREE.Group();
    const claimed = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const orphan = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    root.add(claimed, orphan);

    expect(() =>
      createVisualComponent({
        id: 'cpu',
        kind: 'compute',
        root,
        parts: [{ id: 'package', role: 'package', objects: [claimed] }],
      }),
    ).toThrow(/orphan renderable/);
  });

  it('rejects one renderable being claimed by two parts', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    root.add(mesh);

    expect(() =>
      createVisualComponent({
        id: 'cpu',
        kind: 'compute',
        root,
        parts: [
          { id: 'package', role: 'package', objects: [mesh] },
          { id: 'duplicate', role: 'duplicate', objects: [mesh] },
        ],
      }),
    ).toThrow(/claimed by both/);
  });

  it('rejects objects and anchors outside the component root', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const outside = new THREE.Object3D();
    root.add(mesh);

    expect(() =>
      createVisualComponent({
        id: 'cpu',
        kind: 'compute',
        root,
        parts: [{ id: 'package', role: 'package', objects: [mesh], anchor: outside }],
      }),
    ).toThrow(/anchor.*outside/);
  });
});
