import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { COMPUTE_INSPECTION, buildPexisComputeModule } from './components/PexisComputeModule';
import { primitiveBoxes } from './components/testing';
import { ExplodeRig, explodeEase, stepProgress, type ExplodePlan } from './explode';
import { createVisualComponent, VisualContractError } from './semantic';

function computeRig() {
  const build = buildPexisComputeModule();
  build.component.root.position.set(0, 0, -1.25);
  build.component.root.updateMatrixWorld(true);
  return { build, rig: new ExplodeRig(build.component, COMPUTE_INSPECTION.plan) };
}

function pose(root: THREE.Object3D): number[] {
  return root.children.flatMap((child) => child.position.toArray());
}

function twoPart() {
  const root = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const anchor = new THREE.Object3D();
  root.add(a, b, anchor);
  const component = createVisualComponent({
    id: 'x',
    kind: 'compute',
    root,
    parts: [
      { id: 'a', role: 'r', objects: [a] },
      { id: 'b', role: 'r', objects: [b], anchor },
    ],
  });
  return { component, a, b, anchor };
}

describe('explode easing', () => {
  it('starts and ends exactly and stays monotonic', () => {
    expect(explodeEase(0)).toBe(0);
    expect(explodeEase(1)).toBe(1);
    let previous = 0;
    for (let i = 1; i <= 100; i += 1) {
      const value = explodeEase(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('delays a step without changing where it ends', () => {
    const step = { partId: 'p', direction: [0, 1, 0] as const, distance: 1, delay: 0.25 };
    expect(stepProgress(step, 0.25)).toBe(0);
    expect(stepProgress(step, 0.1)).toBe(0);
    expect(stepProgress(step, 1)).toBe(1);
    expect(stepProgress(step, 0.6)).toBeGreaterThan(0);
  });
});

describe('ExplodeRig on the Pexis Compute module', () => {
  it('restores the assembled pose exactly, bit for bit', () => {
    const { build, rig } = computeRig();
    const rest = pose(build.component.root);
    for (const t of [0.3, 1, 0.71, 0.05, 1]) rig.apply(t);
    rig.apply(0);
    expect(pose(build.component.root)).toEqual(rest);
    rig.apply(0.8);
    rig.restore();
    expect(pose(build.component.root)).toEqual(rest);
    expect(rig.amount).toBe(0);
  });

  it('derives every pose from rest: history does not matter', () => {
    const { build, rig } = computeRig();
    rig.apply(0.42);
    const direct = pose(build.component.root);
    for (let i = 0; i < 200; i += 1) rig.apply((i * 0.137) % 1);
    rig.apply(0.42);
    expect(pose(build.component.root)).toEqual(direct);
  });

  it('moves the anchor with its part so inspection points stay on it', () => {
    const { build, rig } = computeRig();
    const tile = build.component.getPart('compute-tile')!;
    const restAnchor = tile.anchor!.position.clone();
    const restTile = tile.objects[0]!.position.clone();
    rig.apply(1);
    const anchorTravel = tile.anchor!.position.clone().sub(restAnchor);
    const tileTravel = tile.objects[0]!.position.clone().sub(restTile);
    expect(anchorTravel.distanceTo(tileTravel)).toBeLessThan(1e-12);
    expect(tileTravel.y).toBeCloseTo(0.86);
  });

  it('keeps the package as the fixed base', () => {
    const { build, rig } = computeRig();
    const substrate = build.component.getPart('package')!.objects[0]!;
    const rest = substrate.position.clone();
    rig.apply(1);
    expect(substrate.position.equals(rest)).toBe(true);
  });

  it('separates every layer from the one below when fully exploded', () => {
    const { build, rig } = computeRig();
    rig.apply(1);
    const bounds = COMPUTE_INSPECTION.plan.steps.map(({ partId }) => {
      const box = new THREE.Box3();
      for (const object of build.component.getPart(partId)!.objects) {
        for (const p of primitiveBoxes(object)) box.union(p.box);
      }
      return { partId, box };
    });
    for (let i = 1; i < bounds.length; i += 1) {
      const below = bounds[i - 1]!;
      const above = bounds[i]!;
      expect(above.box.min.y, `${above.partId} clears ${below.partId}`).toBeGreaterThan(below.box.max.y + 0.05);
    }
  });

  it('reports the exploded envelope without moving anything', () => {
    const { build, rig } = computeRig();
    rig.apply(0.3);
    const before = pose(build.component.root);
    const full = rig.envelope(1);
    const assembled = rig.envelope(0);
    expect(pose(build.component.root)).toEqual(before);
    expect(full.containsBox(assembled)).toBe(true);
    // Fully exploded, the ring (0.349 + 1.14) is the top of the envelope.
    expect(full.max.y).toBeCloseTo(0.349 + 1.14, 2);
    // Assembled, the flat activity ring at y = 0.349 is the real top.
    expect(assembled.max.y).toBeCloseTo(0.349, 6);
    // The envelope matches the real geometry once the rig is at t = 1.
    rig.apply(1);
    const real = new THREE.Box3().setFromObject(build.component.root);
    expect(full.min.distanceTo(real.min)).toBeLessThan(1e-6);
    expect(full.max.distanceTo(real.max)).toBeLessThan(1e-6);
  });

  it('describes every part of the plan, and nothing else', () => {
    const { build } = computeRig();
    const planned = COMPUTE_INSPECTION.plan.steps.map((s) => s.partId).sort();
    expect(Object.keys(COMPUTE_INSPECTION.parts).sort()).toEqual(planned);
    expect([...build.component.parts.keys()].sort()).toEqual(planned);
    expect(COMPUTE_INSPECTION.parts['activity-ring']!.representation).toBe('observation');
    for (const [id, info] of Object.entries(COMPUTE_INSPECTION.parts)) {
      if (id !== 'activity-ring') expect(info.representation, id).toBe('illustrative');
    }
  });
});

describe('ExplodeRig fails closed', () => {
  const ok: ExplodePlan = {
    componentId: 'x',
    steps: [
      { partId: 'a', direction: [0, 1, 0], distance: 0, delay: 0 },
      { partId: 'b', direction: [0, 1, 0], distance: 1, delay: 0 },
    ],
  };

  it('accepts a complete plan', () => {
    const { component, b, anchor } = twoPart();
    const rig = new ExplodeRig(component, ok);
    rig.apply(1);
    expect(b.position.y).toBe(1);
    expect(anchor.position.y).toBe(1);
  });

  it('rejects unknown, duplicate and omitted parts', () => {
    const { component } = twoPart();
    const unknown = { ...ok, steps: [...ok.steps, { partId: 'c', direction: [0, 1, 0] as const, distance: 1, delay: 0 }] };
    expect(() => new ExplodeRig(component, unknown)).toThrow(VisualContractError);
    const duplicate = { ...ok, steps: [ok.steps[0]!, ok.steps[0]!, ok.steps[1]!] };
    expect(() => new ExplodeRig(component, duplicate)).toThrow(VisualContractError);
    const omitted = { ...ok, steps: [ok.steps[1]!] };
    expect(() => new ExplodeRig(component, omitted)).toThrow(/omits part "a"/);
  });

  it('rejects a plan bound to another component', () => {
    const { component } = twoPart();
    expect(() => new ExplodeRig(component, { ...ok, componentId: 'y' })).toThrow(VisualContractError);
  });

  it('rejects degenerate directions, distances and delays', () => {
    const { component } = twoPart();
    const withStep = (patch: object) => ({ ...ok, steps: [ok.steps[0]!, { ...ok.steps[1]!, ...patch }] });
    expect(() => new ExplodeRig(component, withStep({ direction: [0, 0, 0] }))).toThrow(VisualContractError);
    expect(() => new ExplodeRig(component, withStep({ direction: [0, Number.NaN, 0] }))).toThrow(VisualContractError);
    expect(() => new ExplodeRig(component, withStep({ distance: -1 }))).toThrow(VisualContractError);
    expect(() => new ExplodeRig(component, withStep({ distance: Infinity }))).toThrow(VisualContractError);
    expect(() => new ExplodeRig(component, withStep({ delay: 1 }))).toThrow(VisualContractError);
    expect(() => new ExplodeRig(component, withStep({ delay: -0.1 }))).toThrow(VisualContractError);
  });

  it('rejects nested part objects, whose travel would compound', () => {
    const root = new THREE.Group();
    const outer = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    root.add(outer);
    outer.add(a, b);
    const component = createVisualComponent({
      id: 'x', kind: 'compute', root, parts: [{ id: 'a', role: 'r', objects: [a] }, { id: 'b', role: 'r', objects: [b] }],
    });
    expect(() => new ExplodeRig(component, ok)).toThrow(/direct child/);
  });

  it('clamps non-finite and out-of-range amounts to a defined pose', () => {
    const { component, b } = twoPart();
    const rig = new ExplodeRig(component, ok);
    rig.apply(Number.NaN);
    expect(b.position.y).toBe(0);
    rig.apply(7);
    expect(b.position.y).toBe(1);
    rig.apply(-3);
    expect(b.position.y).toBe(0);
  });
});

describe('semantic part resolution', () => {
  it('resolves every compute renderable to the part that claims it, and nothing else', () => {
    const { build } = computeRig();
    const { component } = build;
    for (const part of component.parts.values()) {
      for (const object of part.objects) {
        object.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) expect(component.partOf(child)?.id).toBe(part.id);
        });
      }
    }
    expect(component.partOf(component.root)).toBeUndefined();
    expect(component.partOf(new THREE.Mesh())).toBeUndefined();
    // Anchors are inspection points, not pickable geometry.
    expect(component.partOf(component.getPart('compute-tile')!.anchor!)).toBeUndefined();
  });
});
