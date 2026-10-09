import * as THREE from 'three';

/**
 * The Pexis hardware surface vocabulary, shared by every procedural module so
 * Compute, Memory and Fabric read as one family. Specs, not shared material
 * instances: each mesh still owns its material, and MachineScene stays the
 * single disposal path.
 *
 * Saturated colour is not a surface. Pexis blue is reserved for real
 * simulator activity, selection and information (see MachineScene).
 */
export interface SurfaceSpec {
  readonly color: number;
  readonly roughness: number;
  readonly metalness: number;
}

export const PEXIS_SURFACE = {
  /** Structural graphite: substrates, mounts, frames. Neutral, not navy. */
  graphite: { color: 0x2a2e35, roughness: 0.5, metalness: 0.18 },
  /** Lighter graphite for carriers that sit next to structural graphite. */
  graphiteSoft: { color: 0x3b4048, roughness: 0.54, metalness: 0.16 },
  /** Satin (not mirror) metal. The scene has no environment map, so high metalness would render as dark banding. */
  satin: { color: 0xb8bdc5, roughness: 0.46, metalness: 0.55 },
  /** Machined rails framing a satin surface. */
  rail: { color: 0x7d838d, roughness: 0.42, metalness: 0.5 },
  /** Illustrative silicon surfaces. Lifted from near-black so they read as material, not as holes. */
  silicon: { color: 0x2b323d, roughness: 0.32, metalness: 0.25 },
  /** Nickel contacts and endpoint lands. */
  nickel: { color: 0x9ea3ab, roughness: 0.38, metalness: 0.7 },
} as const satisfies Record<string, SurfaceSpec>;

export type PexisSurface = keyof typeof PEXIS_SURFACE;

export function pexisMaterial(
  surface: PexisSurface,
  overrides: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ ...PEXIS_SURFACE[surface], ...overrides });
}
