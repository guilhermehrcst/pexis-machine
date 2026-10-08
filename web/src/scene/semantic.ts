import * as THREE from 'three';

/**
 * Semantic identity of a visual machine component. This layer describes the
 * picture of the machine only; it never owns or derives simulator state.
 */
export type VisualComponentKind = 'compute' | 'memory' | 'graphics' | 'fabric';

export interface MachineVisualPart {
  readonly id: string;
  readonly role: string;
  /**
   * Objects that semantically belong to this part. A group claims all of its
   * renderable descendants. Every renderable under a component root must be
   * claimed by exactly one part.
   */
  readonly objects: readonly THREE.Object3D[];
  /** Optional non-rendering point for labels, camera focus, or future overlays. */
  readonly anchor?: THREE.Object3D;
}

export interface MachineVisualComponent<Id extends string = string> {
  readonly id: Id;
  readonly kind: VisualComponentKind;
  readonly root: THREE.Group;
  readonly parts: ReadonlyMap<string, MachineVisualPart>;
  getPart(id: string): MachineVisualPart | undefined;
}

export interface MachineVisualPartDefinition {
  readonly id: string;
  readonly role: string;
  readonly objects: readonly THREE.Object3D[];
  readonly anchor?: THREE.Object3D;
}

export interface MachineVisualComponentDefinition<Id extends string = string> {
  readonly id: Id;
  readonly kind: VisualComponentKind;
  readonly root: THREE.Group;
  readonly parts: readonly MachineVisualPartDefinition[];
}

export class VisualContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VisualContractError';
  }
}

/**
 * Builds and validates one semantic component. Validation is deliberately
 * fail-closed so a future asset or procedural builder cannot silently publish
 * anonymous meshes that selection, x-ray, or inspection cannot address.
 */
export function createVisualComponent<Id extends string>(
  definition: MachineVisualComponentDefinition<Id>,
): MachineVisualComponent<Id> {
  if (definition.id.trim().length === 0) {
    throw new VisualContractError('component id must not be empty');
  }
  if (definition.parts.length === 0) {
    throw new VisualContractError(`component "${definition.id}" must define at least one semantic part`);
  }

  const parts = new Map<string, MachineVisualPart>();
  const claimed = new Map<THREE.Object3D, string>();

  for (const source of definition.parts) {
    if (source.id.trim().length === 0) {
      throw new VisualContractError(`component "${definition.id}" contains an empty part id`);
    }
    if (parts.has(source.id)) {
      throw new VisualContractError(`component "${definition.id}" defines duplicate part "${source.id}"`);
    }
    if (source.objects.length === 0) {
      throw new VisualContractError(`part "${definition.id}/${source.id}" does not own any objects`);
    }

    for (const object of source.objects) {
      if (!isWithin(definition.root, object)) {
        throw new VisualContractError(`part "${definition.id}/${source.id}" owns an object outside its component root`);
      }

      const renderables = collectRenderables(object);
      if (renderables.size === 0) {
        throw new VisualContractError(`part "${definition.id}/${source.id}" does not own any renderable geometry`);
      }

      for (const renderable of renderables) {
        const previous = claimed.get(renderable);
        if (previous !== undefined && previous !== source.id) {
          throw new VisualContractError(
            `renderable "${renderable.name || renderable.type}" is claimed by both "${previous}" and "${source.id}"`,
          );
        }
        claimed.set(renderable, source.id);
      }
    }

    if (source.anchor !== undefined && !isWithin(definition.root, source.anchor)) {
      throw new VisualContractError(`anchor for "${definition.id}/${source.id}" is outside its component root`);
    }

    const objects = Object.freeze([...source.objects]);
    const part: MachineVisualPart =
      source.anchor === undefined
        ? { id: source.id, role: source.role, objects }
        : { id: source.id, role: source.role, objects, anchor: source.anchor };
    parts.set(source.id, part);
  }

  for (const renderable of collectRenderables(definition.root)) {
    if (!claimed.has(renderable)) {
      throw new VisualContractError(
        `component "${definition.id}" contains orphan renderable "${renderable.name || renderable.type}"`,
      );
    }
  }

  return {
    id: definition.id,
    kind: definition.kind,
    root: definition.root,
    parts,
    getPart: (id: string) => parts.get(id),
  };
}

/**
 * Scene-wide semantic index. It deliberately owns no WebGL resources; the
 * MachineScene remains the sole lifecycle owner and disposes the scene graph.
 */
export class MachineVisualRegistry<Id extends string = string> {
  readonly #components = new Map<Id, MachineVisualComponent<Id>>();

  get size(): number {
    return this.#components.size;
  }

  register(component: MachineVisualComponent<Id>): void {
    if (this.#components.has(component.id)) {
      throw new VisualContractError(`duplicate component id "${component.id}"`);
    }
    this.#components.set(component.id, component);
  }

  getComponent(id: Id): MachineVisualComponent<Id> | undefined {
    return this.#components.get(id);
  }

  getPart(componentId: Id, partId: string): MachineVisualPart | undefined {
    return this.#components.get(componentId)?.getPart(partId);
  }

  values(): readonly MachineVisualComponent<Id>[] {
    return [...this.#components.values()];
  }

  clear(): void {
    this.#components.clear();
  }
}

function isWithin(root: THREE.Object3D, object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

function collectRenderables(root: THREE.Object3D): ReadonlySet<THREE.Object3D> {
  const result = new Set<THREE.Object3D>();
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points ||
      object instanceof THREE.Sprite
    ) {
      result.add(object);
    }
  });
  return result;
}
