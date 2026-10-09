import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPexisComputeModule } from './PexisComputeModule';
import { buildPexisFabric } from './PexisFabric';
import { buildPexisMemoryModule } from './PexisMemoryModule';
import { PEXIS_SURFACE } from './palette';
import { renderables } from './testing';

const PALETTE = Object.values(PEXIS_SURFACE).map((spec) => new THREE.Color(spec.color));

function modules() {
  const compute = buildPexisComputeModule();
  const memory = buildPexisMemoryModule();
  const fabric = buildPexisFabric({
    memory: new THREE.Vector3(-1.49, 0.035, 1.35),
    compute: new THREE.Vector3(-0.45, 0.055, -0.25),
    graphicsReserved: new THREE.Vector3(1.5, 0.035, 1.35),
    computeReserved: new THREE.Vector3(0.45, 0.055, -0.25),
  });
  return { compute, memory, fabric };
}

describe('Pexis surface palette', () => {
  it('is the closed surface vocabulary of every opaque hardware part', () => {
    const { compute, memory, fabric } = modules();
    // Observation surfaces are not hardware finish: they carry simulator state.
    const observation = new Set<THREE.Material>([compute.activityMaterial, memory.activityMaterial]);
    for (const root of [compute.component.root, memory.component.root, fabric.component.root]) {
      for (const object of renderables(root)) {
        const material = (object as THREE.Mesh).material as THREE.Material;
        if (observation.has(material) || material.transparent) continue;
        expect(material, object.name).toBeInstanceOf(THREE.MeshStandardMaterial);
        const color = (material as THREE.MeshStandardMaterial).color;
        expect(PALETTE.some((c) => c.equals(color)), `${object.name} uses off-palette colour #${color.getHexString()}`).toBe(true);
      }
    }
  });

  it('keeps Pexis blue off resting surfaces: nothing glows before a real event', () => {
    const { compute, memory, fabric } = modules();
    for (const root of [memory.component.root, fabric.component.root]) {
      for (const object of renderables(root)) {
        const material = (object as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const glow = material.emissive.getHex() === 0 ? 0 : material.emissiveIntensity;
        expect(glow, object.name).toBe(0);
      }
    }
    // The compute ring's resting state is a neutral grey, never the accent.
    const ring = compute.activityMaterial;
    expect(ring.emissive.getHex()).not.toBe(new THREE.Color(0x2f6bff).getHex());
    for (const lane of fabric.activeLanes) expect(lane.material.emissiveIntensity).toBe(0);
  });
});
