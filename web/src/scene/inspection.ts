import type { ExplodePlan } from './explode';
import type { ComponentId } from './transfers';

/**
 * What a part is, stated honestly. 'illustrative' geometry depicts a possible
 * physical organisation; 'observation' surfaces display real simulator state.
 * Neither is a structure the core simulates.
 */
export type PartRepresentation = 'illustrative' | 'observation';

export interface PartInspection {
  readonly title: string;
  /** The part's semantic role, from the component contract. */
  readonly role: string;
  readonly summary: string;
  readonly relation: string;
  readonly representation: PartRepresentation;
}

export interface ComponentInspection {
  readonly componentId: ComponentId;
  readonly title: string;
  /** What the core really simulates for this component, verbatim. */
  readonly simulated: string;
  readonly plan: ExplodePlan;
  /** Keyed by semantic part id; must cover exactly the plan's parts. */
  readonly parts: Readonly<Record<string, PartInspection>>;
}

export const REPRESENTATION_LABEL: Readonly<Record<PartRepresentation, string>> = {
  illustrative: 'Illustrative physical geometry',
  observation: 'Observation of real core state',
};
