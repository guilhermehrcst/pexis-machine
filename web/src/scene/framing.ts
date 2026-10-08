import * as THREE from 'three';

/**
 * Geometric camera framing. Given what must be visible (world-space points) and
 * the screen area left free by HTML overlays, it solves for the closest camera
 * distance along a fixed view direction at which every point
 * projects inside that area, then re-centres the points in it.
 *
 * Pure and deterministic: no DOM, no renderer, no per-device constants.
 */
export interface FramingInsets {
  /** Fractions of the viewport (0..1) reserved by overlays on each side. */
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface FramingRequest {
  /** World-space points that must be visible, e.g. the corners of each component's box. */
  readonly points: readonly THREE.Vector3[];
  /** Unit vector from the target towards the camera. */
  readonly direction: THREE.Vector3;
  /** Vertical field of view, degrees. */
  readonly fov: number;
  readonly aspect: number;
  readonly insets: FramingInsets;
}

export interface FramingResult {
  readonly target: THREE.Vector3;
  readonly distance: number;
  readonly position: THREE.Vector3;
}

export const NO_INSETS: FramingInsets = { top: 0, right: 0, bottom: 0, left: 0 };

const CENTERING_PASSES = 4;
const SEARCH_STEPS = 40;

export function fitPointsToView(request: FramingRequest): FramingResult {
  const { fov, aspect } = request;
  const corners = request.points;
  if (corners.length === 0 || corners.some((p) => !Number.isFinite(p.x + p.y + p.z)) || !(aspect > 0) || !(fov > 0 && fov < 180)) {
    throw new RangeError('fitPointsToView requires finite points, positive aspect and a valid fov');
  }
  const box = new THREE.Box3().setFromPoints([...corners]);
  const insets = clampInsets(request.insets);
  const direction = request.direction.clone().normalize();

  // The usable rectangle in normalised device coordinates.
  const area = {
    minX: -1 + 2 * insets.left,
    maxX: 1 - 2 * insets.right,
    minY: -1 + 2 * insets.bottom,
    maxY: 1 - 2 * insets.top,
  };

  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.01, 1000);
  const target = box.getCenter(new THREE.Vector3());
  let distance = 1;

  for (let pass = 0; pass < CENTERING_PASSES; pass += 1) {
    distance = solveDistance(camera, corners, target, direction, area, box);
    const bounds = projectedBounds(camera, corners, target, direction, distance);

    // Shift the target so the projected box centre lands on the area centre.
    const dxNdc = (area.minX + area.maxX) / 2 - (bounds.minX + bounds.maxX) / 2;
    const dyNdc = (area.minY + area.maxY) / 2 - (bounds.minY + bounds.maxY) / 2;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * distance;
    const halfWidth = halfHeight * aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    target.addScaledVector(right, -dxNdc * halfWidth).addScaledVector(up, -dyNdc * halfHeight);
  }

  distance = solveDistance(camera, corners, target, direction, area, box);
  return { target, distance, position: target.clone().addScaledVector(direction, distance) };
}

/** Projected NDC bounds of a box seen from `target + direction * distance`. */
export function projectedBounds(
  camera: THREE.PerspectiveCamera,
  corners: readonly THREE.Vector3[],
  target: THREE.Vector3,
  direction: THREE.Vector3,
  distance: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  place(camera, target, direction, distance);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const p = new THREE.Vector3();
  for (const corner of corners) {
    p.copy(corner).project(camera);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

export function boxCorners(box: THREE.Box3): THREE.Vector3[] {
  const { min, max } = box;
  const corners: THREE.Vector3[] = [];
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
    corners.push(new THREE.Vector3(x, y, z));
  }
  return corners;
}

/** Convenience: frame the eight corners of a box. */
function solveDistance(
  camera: THREE.PerspectiveCamera,
  corners: readonly THREE.Vector3[],
  target: THREE.Vector3,
  direction: THREE.Vector3,
  area: { minX: number; maxX: number; minY: number; maxY: number },
  box: THREE.Box3,
): number {
  const fits = (d: number): boolean => {
    // Every corner must stay in front of the camera and inside the area.
    place(camera, target, direction, d);
    const view = new THREE.Vector3();
    for (const corner of corners) {
      view.copy(corner).applyMatrix4(camera.matrixWorldInverse);
      if (view.z > -camera.near) return false;
    }
    const b = projectedBounds(camera, corners, target, direction, d);
    return b.minX >= area.minX && b.maxX <= area.maxX && b.minY >= area.minY && b.maxY <= area.maxY;
  };

  const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
  let lo = radius * 0.05;
  let hi = radius * 4;
  // The usable area always contains the NDC origin (each inset is clamped to
  // 0.4), so a far enough camera always fits. The cap only guards against NaN.
  for (let doublings = 0; !fits(hi); doublings += 1) {
    if (doublings > 30) throw new RangeError('fitBoxToView could not fit the box');
    hi *= 2;
  }
  for (let i = 0; i < SEARCH_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

function place(camera: THREE.PerspectiveCamera, target: THREE.Vector3, direction: THREE.Vector3, distance: number): void {
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
}

function clampInsets(insets: FramingInsets): FramingInsets {
  const c = (v: number) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), 0.4) : 0);
  return { top: c(insets.top), right: c(insets.right), bottom: c(insets.bottom), left: c(insets.left) };
}
