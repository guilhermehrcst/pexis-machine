// MachineClient: the only path from the Web Lab to the simulator.
//
// Every command forwards to the WebAssembly adapter and then re-reads the
// resulting state from it. The client keeps no machine state of its own, so
// the browser cannot drift from the simulator.

import type { PexisMachineModule, WasmWebMachine } from '../wasm/pexis-machine';
import {
  BoundaryError,
  parseEvents,
  parseExperiments,
  parseProgram,
  parseSnapshot,
} from './boundary';
import type { ExperimentInfo, LoadedProgram, MachineEvent, MachineSnapshot } from './types';

export const EXPECTED_ABI_VERSION = 1;
export const MAX_MEMORY_READ = 4096;

export interface MachineState {
  readonly snapshot: MachineSnapshot;
  readonly program: LoadedProgram | null;
}

export interface StepOutcome extends MachineState {
  /** Events the core emitted for this step, in emission order. */
  readonly events: readonly MachineEvent[];
}

export class MachineClient {
  readonly memorySize: number;
  readonly experiments: readonly ExperimentInfo[];
  #machine: WasmWebMachine | null;

  constructor(machine: WasmWebMachine) {
    const abi = machine.abiVersion();
    if (abi !== EXPECTED_ABI_VERSION) {
      machine.delete();
      throw new BoundaryError(`ABI version ${abi} does not match expected ${EXPECTED_ABI_VERSION}`);
    }
    const memorySize = machine.memorySize();
    if (!Number.isSafeInteger(memorySize) || memorySize <= 0) {
      machine.delete();
      throw new BoundaryError('memorySize must be a positive integer');
    }
    this.#machine = machine;
    this.memorySize = memorySize;
    this.experiments = parseExperiments(machine.experiments());
  }

  static fromModule(module: PexisMachineModule): MachineClient {
    return new MachineClient(new module.WebMachine());
  }

  get disposed(): boolean {
    return this.#machine === null;
  }

  /** Resets the machine and loads the experiment's real program bytes. */
  load(experimentId: string): MachineState {
    const machine = this.#live();
    if (!this.experiments.some((e) => e.id === experimentId)) {
      throw new RangeError(`unknown experiment ${JSON.stringify(experimentId)}`);
    }
    machine.loadExperiment(experimentId);
    return this.state();
  }

  /** Core reset followed by a reload of the currently loaded experiment. */
  reset(): MachineState {
    this.#live().reset();
    return this.state();
  }

  /** Exactly one Machine::step() in the core. */
  step(): StepOutcome {
    const machine = this.#live();
    machine.step();
    const events = parseEvents(machine.lastEvents());
    return { ...this.state(), events };
  }

  state(): MachineState {
    const machine = this.#live();
    return {
      snapshot: parseSnapshot(machine.snapshot()),
      program: parseProgram(machine.program()),
    };
  }

  /**
   * Observation-only RAM read. Invalid ranges are rejected here and, again,
   * by the adapter (which returns null); neither path touches telemetry.
   */
  readMemory(address: number, length: number): Uint8Array {
    const machine = this.#live();
    if (
      !Number.isSafeInteger(address) ||
      !Number.isSafeInteger(length) ||
      address < 0 ||
      length < 0 ||
      length > MAX_MEMORY_READ ||
      address + length > this.memorySize
    ) {
      throw new RangeError(`memory range [${address}, ${address}+${length}) is outside RAM`);
    }
    const bytes = machine.readMemory(address, length);
    if (!(bytes instanceof Uint8Array) || bytes.length !== length) {
      throw new BoundaryError('readMemory returned an unexpected value');
    }
    return bytes;
  }

  dispose(): void {
    this.#machine?.delete();
    this.#machine = null;
  }

  #live(): WasmWebMachine {
    if (this.#machine === null) {
      throw new Error('MachineClient has been disposed');
    }
    return this.#machine;
  }
}

/** Loads the generated Emscripten module and creates a client. */
export async function createMachineClient(): Promise<MachineClient> {
  const { default: createPexisMachine } = await import('../wasm/pexis-machine.js');
  const module = await createPexisMachine();
  return MachineClient.fromModule(module);
}
