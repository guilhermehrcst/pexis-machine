import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Small procedural geometry kit for machine hardware. These helpers keep shape
 * construction consistent without introducing a second scene framework.
 *
 * M1A intentionally exposes only primitives already used by the current scene.
 * New domain shapes should be added when a real component needs them.
 */
export function roundedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  segments: number,
  radius: number,
): RoundedBoxGeometry {
  return new RoundedBoxGeometry(width, height, depth, segments, radius);
}

export function boxGeometry(width: number, height: number, depth: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(width, height, depth);
}
