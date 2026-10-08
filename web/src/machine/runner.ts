// RunController: paces repeated Machine::step() calls from the browser.
//
// "Pace" is a browser visualization rate. It is not a clock frequency: M0 is a
// functional model with abstract cycles and has no physical timing.
//
// Guarantees:
//   - at most one pending timer exists at any time;
//   - pause() takes effect before the next step;
//   - a run stops by itself on halted or faulted;
//   - a single tick never executes more than `stepsPerTick` steps, so the main
//     thread is yielded between batches;
//   - a run stops after `maxStepsPerRun` steps as a browser-side guard. This is
//     a host pause, not a machine fault, and never changes machine state.

import type { StepOutcome } from './client';
import { isTerminal } from './types';

export type Pace = 'slow' | 'normal' | 'fast' | 'max';

export interface PaceSpec {
  readonly label: string;
  readonly intervalMs: number;
  readonly stepsPerTick: number;
}

export const PACES: Readonly<Record<Pace, PaceSpec>> = {
  slow: { label: '1 step/s', intervalMs: 1000, stepsPerTick: 1 },
  normal: { label: '3 steps/s', intervalMs: 333, stepsPerTick: 1 },
  fast: { label: '10 steps/s', intervalMs: 100, stepsPerTick: 1 },
  max: { label: 'Unpaced', intervalMs: 16, stepsPerTick: 256 },
};

export const PACE_ORDER: readonly Pace[] = ['slow', 'normal', 'fast', 'max'];

export type StopReason = 'paused' | 'halted' | 'faulted' | 'budget' | 'error';

export interface Scheduler {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RunControllerOptions {
  /** Performs exactly one simulator step. */
  readonly step: () => StepOutcome;
  /** Receives every outcome of one tick, in order. */
  readonly onTick: (outcomes: readonly StepOutcome[]) => void;
  readonly onStop: (reason: StopReason, error?: unknown) => void;
  readonly scheduler?: Scheduler;
  readonly maxStepsPerRun?: number;
}

const defaultScheduler: Scheduler = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class RunController {
  readonly #options: RunControllerOptions;
  readonly #scheduler: Scheduler;
  readonly #maxStepsPerRun: number;
  #pace: Pace = 'normal';
  #timer: unknown = null;
  #running = false;
  #stepsThisRun = 0;

  constructor(options: RunControllerOptions) {
    this.#options = options;
    this.#scheduler = options.scheduler ?? defaultScheduler;
    this.#maxStepsPerRun = options.maxStepsPerRun ?? 1_000_000;
  }

  get running(): boolean {
    return this.#running;
  }

  get pace(): Pace {
    return this.#pace;
  }

  setPace(pace: Pace): void {
    this.#pace = pace;
    if (this.#running) {
      this.#clear();
      this.#schedule();
    }
  }

  /** Starts a run. A second start() while running is a no-op. */
  start(): void {
    if (this.#running) {
      return;
    }
    this.#running = true;
    this.#stepsThisRun = 0;
    // The first step happens immediately so Run feels responsive.
    this.#tick();
  }

  pause(): void {
    this.#stop('paused');
  }

  /** Stops without reporting (used on teardown). */
  dispose(): void {
    this.#running = false;
    this.#clear();
  }

  #tick(): void {
    this.#timer = null;
    if (!this.#running) {
      return;
    }
    const { stepsPerTick } = PACES[this.#pace];
    const outcomes: StepOutcome[] = [];
    let stop: StopReason | null = null;
    try {
      for (let i = 0; i < stepsPerTick; i += 1) {
        const outcome = this.#options.step();
        outcomes.push(outcome);
        this.#stepsThisRun += 1;
        if (isTerminal(outcome.snapshot.status)) {
          stop = outcome.snapshot.status === 'halted' ? 'halted' : 'faulted';
          break;
        }
        if (this.#stepsThisRun >= this.#maxStepsPerRun) {
          stop = 'budget';
          break;
        }
      }
    } catch (error) {
      if (outcomes.length > 0) {
        this.#options.onTick(outcomes);
      }
      this.#stop('error', error);
      return;
    }

    this.#options.onTick(outcomes);
    if (stop !== null) {
      this.#stop(stop);
      return;
    }
    // onTick may have paused the run.
    if (this.#running) {
      this.#schedule();
    }
  }

  #schedule(): void {
    if (this.#timer !== null) {
      return;
    }
    this.#timer = this.#scheduler.setTimeout(() => this.#tick(), PACES[this.#pace].intervalMs);
  }

  #clear(): void {
    if (this.#timer !== null) {
      this.#scheduler.clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  #stop(reason: StopReason, error?: unknown): void {
    const wasRunning = this.#running;
    this.#running = false;
    this.#clear();
    if (wasRunning) {
      this.#options.onStop(reason, error);
    }
  }
}
