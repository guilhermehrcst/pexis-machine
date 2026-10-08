import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NO_INSETS, boxCorners, fitPointsToView, projectedBounds, type FramingInsets } from './framing';

const BOX = new THREE.Box3(new THREE.Vector3(-4.2, 0, -2.4), new THREE.Vector3(4.0, 1.3, 2.2));
const DIRECTION = new THREE.Vector3(2.6, 6.25, 8.45).normalize();

function boundsFor(aspect: number, insets: FramingInsets = NO_INSETS) {
  const fit = fitPointsToView({ points: boxCorners(BOX), direction: DIRECTION, fov: 32, aspect, insets });
  const camera = new THREE.PerspectiveCamera(32, aspect, 0.01, 1000);
  return { fit, b: projectedBounds(camera, boxCorners(BOX), fit.target, DIRECTION, fit.distance) };
}

describe('fitPointsToView', () => {
  it('frames a tighter hull than the enclosing box when given per-component corners', () => {
    // Two separated components: their own corners leave the empty diagonal out.
    const a = new THREE.Box3(new THREE.Vector3(-4, 0, -2.4), new THREE.Vector3(-1.5, 1, 1.8));
    const b = new THREE.Box3(new THREE.Vector3(1.5, 0, 0.5), new THREE.Vector3(4, 0.3, 2.2));
    const union = a.clone().union(b);
    const tight = fitPointsToView({ points: [...boxCorners(a), ...boxCorners(b)], direction: DIRECTION, fov: 32, aspect: 1.6, insets: NO_INSETS });
    const loose = fitPointsToView({ points: boxCorners(union), direction: DIRECTION, fov: 32, aspect: 1.6, insets: NO_INSETS });
    expect(tight.distance).toBeLessThan(loose.distance);
  });

  it.each([0.6, 0.77, 1.0, 1.33, 2.1])('keeps the whole box inside the view and touches one edge (aspect %s)', (aspect) => {
    const { b } = boundsFor(aspect);
    for (const v of [b.minX, b.maxX, b.minY, b.maxY]) expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-6);
    // Tight: the binding axis reaches the edge (no wasted margin).
    const slack = Math.min(1 - b.maxX, b.minX + 1, 1 - b.maxY, b.minY + 1);
    expect(slack).toBeLessThan(0.01);
  });

  it.each([0.6, 1.0, 2.1])('centres the box on both axes (aspect %s)', (aspect) => {
    const { b } = boundsFor(aspect);
    expect(Math.abs((b.minX + b.maxX) / 2)).toBeLessThan(0.01);
    expect(Math.abs((b.minY + b.maxY) / 2)).toBeLessThan(0.01);
  });

  it('respects overlay insets and centres inside the free area', () => {
    const insets = { top: 0.1, right: 0.02, bottom: 0.06, left: 0.02 };
    const { b } = boundsFor(1.0, insets);
    expect(b.maxY).toBeLessThanOrEqual(1 - 2 * insets.top + 1e-6);
    expect(b.minY).toBeGreaterThanOrEqual(-1 + 2 * insets.bottom - 1e-6);
    const areaCentreY = (-1 + 2 * insets.bottom + 1 - 2 * insets.top) / 2;
    expect(Math.abs((b.minY + b.maxY) / 2 - areaCentreY)).toBeLessThan(0.01);
  });

  it('moves the camera back for narrower viewports instead of using zoom', () => {
    const wide = boundsFor(2.1).fit.distance;
    const square = boundsFor(1.0).fit.distance;
    const portrait = boundsFor(0.6).fit.distance;
    expect(square).toBeGreaterThan(wide * 0.99);
    expect(portrait).toBeGreaterThan(square);
  });

  it('keeps the view direction it was given', () => {
    const { fit } = boundsFor(1.33);
    const dir = fit.position.clone().sub(fit.target).normalize();
    expect(dir.distanceTo(DIRECTION)).toBeLessThan(1e-9);
  });

  it('is deterministic', () => {
    const a = boundsFor(1.07).fit;
    const b = boundsFor(1.07).fit;
    expect(a.distance).toBe(b.distance);
    expect(a.target.equals(b.target)).toBe(true);
  });

  it('fails closed on invalid input and clamps absurd insets', () => {
    expect(() => fitPointsToView({ points: [], direction: DIRECTION, fov: 32, aspect: 1, insets: NO_INSETS })).toThrow(RangeError);
    expect(() => fitPointsToView({ points: boxCorners(BOX), direction: DIRECTION, fov: 32, aspect: 0, insets: NO_INSETS })).toThrow(RangeError);
    const fit = fitPointsToView({ points: boxCorners(BOX), direction: DIRECTION, fov: 32, aspect: 1, insets: { top: 9, bottom: Number.NaN, left: -1, right: 0.4 } });
    expect(Number.isFinite(fit.distance)).toBe(true);
  });
});
