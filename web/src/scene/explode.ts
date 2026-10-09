import * as THREE from 'three';
import { VisualContractError, type MachineVisualComponent, type MachineVisualPart } from './semantic';

/**
 * Exploded inspection: a purely visual, reversible separation of a semantic
 * component into its existing parts. It never creates geometry, never touches
 * simulator state, and moves only objects the semantic contract already names.
 */

/** One part's separation, in the component root's local frame. */
export interface ExplodeStep {
  readonly partId: string;
  /** Direction of travel. Normalised on use; must not be zero. */
  readonly direction: readonly [number, number, number];
  /** Travel at full separation, in world units. 0 keeps the part as the base. */
  readonly distance: number;
  /**
   * Fraction of the explode range [0, 1) that passes before this part starts
   * moving. Staggered delays give an ordered separation; equal delays move
   * parts together. Every part arrives at t = 1.
   */
  readonly delay: number;
}

/**
 * The plan must name every part of its component exactly once: separation is
 * a deliberate decision per part, including the parts that stay put.
 */
export interface ExplodePlan {
  readonly componentId: string;
  readonly steps: readonly ExplodeStep[];
}

/** Smooth, symmetric ease; f(0) = 0 and f(1) = 1 exactly. */
export function explodeEase(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Progress of one step at global explode amount `t`; exactly 0 at t = 0 and 1 at t = 1. */
export function stepProgress(step: ExplodeStep, t: number): number {
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  return explodeEase((t - step.delay) / (1 - step.delay));
}

interface Moving {
  readonly object: THREE.Object3D;
  readonly rest: THREE.Vector3;
}

interface RiggedStep {
  readonly step: ExplodeStep;
  readonly part: MachineVisualPart;
  readonly direction: THREE.Vector3;
  readonly moving: readonly Moving[];
}

/**
 * Binds a plan to a built component. Rest positions are captured once, at
 * construction, from the assembled component. Every position after that is
 * derived from rest and the current amount, never accumulated, so the same
 * amount always yields the same pose and amount 0 restores rest exactly.
 *
 * Policy: whole-object translation only. An InstancedMesh moves as one set;
 * its instances get no identity of their own.
 */
export class ExplodeRig {
  readonly component: MachineVisualComponent;
  readonly plan: ExplodePlan;
  readonly #steps: readonly RiggedStep[];
  #amount = 0;

  constructor(component: MachineVisualComponent, plan: ExplodePlan) {
    if (plan.componentId !== component.id) {
      throw new VisualContractError(`explode plan for "${plan.componentId}" bound to "${component.id}"`);
    }
    const seen = new Set<string>();
    const moved = new Set<THREE.Object3D>();
    const steps: RiggedStep[] = [];
    for (const step of plan.steps) {
      const part = component.getPart(step.partId);
      if (part === undefined) {
        throw new VisualContractError(`explode plan names unknown part "${component.id}/${step.partId}"`);
      }
      if (seen.has(step.partId)) {
        throw new VisualContractError(`explode plan names "${component.id}/${step.partId}" twice`);
      }
      seen.add(step.partId);
      const direction = new THREE.Vector3(...step.direction);
      if (!Number.isFinite(direction.lengthSq()) || direction.lengthSq() === 0) {
        throw new VisualContractError(`explode direction for "${step.partId}" must be a finite non-zero vector`);
      }
      direction.normalize();
      if (!Number.isFinite(step.distance) || step.distance < 0) {
        throw new VisualContractError(`explode distance for "${step.partId}" must be finite and >= 0`);
      }
      if (!(step.delay >= 0 && step.delay < 1)) {
        throw new VisualContractError(`explode delay for "${step.partId}" must be in [0, 1)`);
      }
      // Anchors travel with their part so inspection points stay on it.
      const objects = part.anchor ? [...part.objects, part.anchor] : [...part.objects];
      const moving: Moving[] = [];
      for (const object of objects) {
        // Directions are root-local: a moved object must be a direct child of
        // the root, and never inside another moved object (double travel).
        if (object.parent !== component.root) {
          throw new VisualContractError(`"${component.id}/${step.partId}" object "${object.name}" is not a direct child of the component root`);
        }
        if (moved.has(object)) {
          throw new VisualContractError(`object "${object.name}" is moved by two explode steps`);
        }
        moved.add(object);
        moving.push({ object, rest: object.position.clone() });
      }
      steps.push({ step, part, direction, moving });
    }
    for (const partId of component.parts.keys()) {
      if (!seen.has(partId)) {
        throw new VisualContractError(`explode plan for "${component.id}" omits part "${partId}"`);
      }
    }
    this.component = component;
    this.plan = plan;
    this.#steps = steps;
  }

  get amount(): number {
    return this.#amount;
  }

  /** Poses every part for explode amount `t` (clamped to [0, 1]). */
  apply(t: number): void {
    const amount = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
    this.#amount = amount;
    for (const { step, direction, moving } of this.#steps) {
      const travel = step.distance * stepProgress(step, amount);
      for (const { object, rest } of moving) {
        object.position.copy(rest);
        if (travel !== 0) object.position.addScaledVector(direction, travel);
      }
    }
  }

  /** Returns every part to its captured rest position, bit for bit (apply(0) copies rest). */
  restore(): void {
    this.apply(0);
  }

  /** Offset of a part at amount `t`, in root-local units. */
  offset(partId: string, t: number): THREE.Vector3 {
    const rigged = this.#steps.find((s) => s.part.id === partId);
    if (!rigged) throw new VisualContractError(`unknown part "${partId}"`);
    return rigged.direction.clone().multiplyScalar(rigged.step.distance * stepProgress(rigged.step, t));
  }

  /**
   * World-space bounds of the whole component at amount `t` (default: fully
   * exploded), without moving anything: each part's current world bounds,
   * shifted by the difference between its offset at `t` and its current
   * offset. The camera frames this envelope once, so dragging the separation
   * never moves the camera.
   */
  envelope(t = 1): THREE.Box3 {
    const root = this.component.root;
    root.updateWorldMatrix(true, true);
    const linear = new THREE.Matrix3().setFromMatrix4(root.matrixWorld);
    const box = new THREE.Box3();
    const partBox = new THREE.Box3();
    for (const { part } of this.#steps) {
      partBox.makeEmpty();
      for (const object of part.objects) partBox.expandByObject(object);
      const shift = this.offset(part.id, t).sub(this.offset(part.id, this.#amount)).applyMatrix3(linear);
      box.union(partBox.translate(shift));
    }
    return box;
  }
}
