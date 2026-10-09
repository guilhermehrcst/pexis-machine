import type { ComponentId } from '../scene/transfers';

/**
 * UI state of an exploded inspection. Visual only: nothing here is ever sent
 * to the simulator. `animate` says how the scene should reach `amount`
 * (true for Explode/Assemble, false while dragging the slider).
 */
export interface InspectionState {
  readonly component: ComponentId;
  readonly part: string | null;
  readonly amount: number;
  readonly animate: boolean;
}
