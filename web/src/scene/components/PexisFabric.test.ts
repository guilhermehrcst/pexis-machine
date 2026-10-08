import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  FABRIC_VISUAL_LINKS,
  buildPexisFabric,
  type PexisFabricPorts,
} from './PexisFabric';

const PORTS: PexisFabricPorts = {
  memory: new THREE.Vector3(-1.49, 0.035, 1.35),
  compute: new THREE.Vector3(-0.45, 0.055, -0.25),
  graphicsReserved: new THREE.Vector3(1.5, 0.035, 1.35),
  computeReserved: new THREE.Vector3(0.45, 0.055, -0.25),
};

function build() {
  return buildPexisFabric(PORTS);
}

function renderables(root: THREE.Object3D): THREE.Object3D[] {
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

describe('Pexis Fabric', () => {
  it('declares the observed CPU/RAM link and marks GPU as planned, not functional', () => {
    expect(FABRIC_VISUAL_LINKS).toEqual([
      { id: 'memory-compute', from: 'ram', to: 'cpu', state: 'event-backed' },
      { id: 'graphics-reserved', from: 'gpu', to: 'cpu', state: 'planned' },
    ]);
    expect(FABRIC_VISUAL_LINKS.filter((link) => link.state === 'event-backed')).toHaveLength(1);
  });

  it('keeps the existing simulator-facing interconnect id with full semantic binding', () => {
    const { component } = build();
    expect(component.id).toBe('interconnect');
    expect(component.kind).toBe('fabric');
    expect([...component.parts.keys()]).toEqual([
      'carrier',
      'frame',
      'active-ports',
      'graphics-reserved-port',
      'fabric-mark',
      'ram-lanes',
      'gpu-reserved-lanes',
    ]);
    expect(component.getPart('carrier')?.anchor?.name).toBe('anchor.fabric-center');
    expect(component.getPart('active-ports')?.anchor?.name).toBe('anchor.fabric-memory');
    expect(component.getPart('graphics-reserved-port')?.anchor?.name).toBe('anchor.fabric-graphics-reserved');
  });

  it('has exactly three event-backed lanes and three non-animated graphics stubs', () => {
    const { component, activeLanes, transferPath, plannedPaths } = build();
    expect(activeLanes).toHaveLength(3);
    expect(plannedPaths).toHaveLength(3);
    expect(transferPath).toBe(activeLanes[1]!.curve);
    expect(component.getPart('ram-lanes')?.objects).toHaveLength(3);
    const planned = component.getPart('gpu-reserved-lanes')?.objects;
    expect(planned).toHaveLength(3);
    for (const object of planned ?? []) {
      expect(object).toBeInstanceOf(THREE.Line);
      if (!(object instanceof THREE.Line)) throw new Error('Missing reserved line');
      expect(object.material).toBeInstanceOf(THREE.LineDashedMaterial);
      expect((object.material as THREE.LineDashedMaterial).opacity).toBeLessThan(1);
    }
    for (const lane of activeLanes) {
      expect(lane.material.emissiveIntensity).toBe(0);
    }
  });

  it('preserves directional RAM -> CPU routing and never crosses the reserved lane corridor', () => {
    const { activeLanes, plannedPaths } = build();
    const transfer = activeLanes[1]!.curve;
    const start = transfer.getPoint(0);
    const end = transfer.getPoint(1);
    expect(start.x).toBeCloseTo(PORTS.memory.x);
    expect(start.z).toBeCloseTo(PORTS.memory.z);
    expect(end.x).toBeCloseTo(PORTS.compute.x);
    expect(end.z).toBeCloseTo(PORTS.compute.z);

    for (const lane of activeLanes) {
      expect(lane.curve.getSpacedPoints(48).every((point) => point.x < 0)).toBe(true);
    }
    for (const path of plannedPaths) {
      expect(path.getSpacedPoints(48).every((point) => point.x > 0)).toBe(true);
    }
  });

  it('keeps the industrial Fabric detail within an eleven-renderable budget', () => {
    const { component } = build();
    const objects = renderables(component.root);
    expect(objects.length).toBeLessThanOrEqual(11);
    expect(objects.filter((object) => object instanceof THREE.InstancedMesh)
      .map((mesh) => (mesh as THREE.InstancedMesh).count).sort((a, b) => a - b)).toEqual([2, 4]);
    expect(objects.some((object) => object.name === 'fabric.carrier')).toBe(true);
  });

  it('rejects impossible port layouts instead of publishing disconnected geometry', () => {
    expect(() => buildPexisFabric({ ...PORTS, memory: new THREE.Vector3(Number.NaN, 0, 1) })).toThrow(RangeError);
    expect(() => buildPexisFabric({ ...PORTS, memory: new THREE.Vector3(2, 0, 1.35) })).toThrow(RangeError);
    expect(() => buildPexisFabric({
      ...PORTS,
      graphicsReserved: new THREE.Vector3(-1, 0, 1.35),
    })).toThrow(RangeError);
  });
});
