import { COMPUTE_INSPECTION } from './components/PexisComputeModule';
import type { ComponentInspection } from './inspection';
import type { ComponentId } from './transfers';

/**
 * Components that support exploded inspection. M1G ships the Compute module
 * as the vertical slice; Memory and Fabric reuse the same rig in later PRs.
 */
export const INSPECTIONS: Readonly<Partial<Record<ComponentId, ComponentInspection>>> = {
  cpu: COMPUTE_INSPECTION,
};

export function inspectionFor(id: ComponentId | null): ComponentInspection | null {
  return id === null ? null : INSPECTIONS[id] ?? null;
}
