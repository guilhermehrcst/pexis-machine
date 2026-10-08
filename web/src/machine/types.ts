// Typed view of the simulator state, as delivered by the WebAssembly adapter.
// These types describe observations. Nothing in the Web Lab computes them.

export const MACHINE_STATUSES = ['ready', 'running', 'halted', 'faulted'] as const;
export type MachineStatus = (typeof MACHINE_STATUSES)[number];

export const FAULT_CODES = [
  'none',
  'invalid-opcode',
  'invalid-register',
  'memory-out-of-bounds',
  'truncated-instruction',
  'step-limit-exceeded',
] as const;
export type FaultCode = (typeof FAULT_CODES)[number];

export const REGISTER_COUNT = 8;

export interface Telemetry {
  readonly instructionsRetired: bigint;
  readonly cycles: bigint;
  readonly loads: bigint;
  readonly stores: bigint;
  readonly instructionBytes: bigint;
  readonly dataBytesRead: bigint;
  readonly dataBytesWritten: bigint;
  readonly bytesMoved: bigint;
}

export interface MachineSnapshot {
  readonly status: MachineStatus;
  readonly fault: FaultCode;
  readonly pc: bigint;
  readonly registers: readonly bigint[];
  readonly telemetry: Telemetry;
}

export type MachineEvent =
  | { readonly kind: 'instruction-fetch'; readonly address: bigint; readonly size: number }
  | {
      readonly kind: 'memory-read';
      readonly address: bigint;
      readonly size: number;
      readonly value: bigint;
      readonly reg: number;
    }
  | {
      readonly kind: 'memory-write';
      readonly address: bigint;
      readonly size: number;
      readonly value: bigint;
      readonly reg: number;
    }
  | { readonly kind: 'register-write'; readonly reg: number; readonly value: bigint }
  | { readonly kind: 'instruction-retired'; readonly address: bigint; readonly nextPc: bigint }
  | { readonly kind: 'halted'; readonly address: bigint }
  | { readonly kind: 'faulted'; readonly address: bigint; readonly fault: FaultCode };

export type MachineEventKind = MachineEvent['kind'];

export const DECODE_STATUSES = ['ok', 'invalid-opcode', 'truncated'] as const;
export type DecodeStatus = (typeof DECODE_STATUSES)[number];

export interface ProgramLine {
  readonly address: bigint;
  readonly length: number;
  readonly opcode: number;
  readonly status: DecodeStatus;
  readonly text: string;
}

export interface LoadedProgram {
  readonly experimentId: string;
  readonly base: bigint;
  readonly length: number;
  readonly instructions: readonly ProgramLine[];
}

export interface ExperimentInfo {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
}

export function isTerminal(status: MachineStatus): boolean {
  return status === 'halted' || status === 'faulted';
}
