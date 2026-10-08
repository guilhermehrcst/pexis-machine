// Validation of every value that crosses the WebAssembly boundary.
//
// The parser is fail-closed: any missing field, wrong type, unknown enum name,
// or out-of-range number throws a BoundaryError. The Web Lab never renders a
// value it could not validate, so NaN/undefined cannot leak into the UI.

import {
  DECODE_STATUSES,
  FAULT_CODES,
  MACHINE_STATUSES,
  REGISTER_COUNT,
  type DecodeStatus,
  type ExperimentInfo,
  type FaultCode,
  type LoadedProgram,
  type MachineEvent,
  type MachineSnapshot,
  type MachineStatus,
  type ProgramLine,
  type Telemetry,
} from './types';

export class BoundaryError extends Error {
  constructor(message: string) {
    super(`WebAssembly boundary violation: ${message}`);
    this.name = 'BoundaryError';
  }
}

type Fields = Record<string, unknown>;

function record(value: unknown, path: string): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BoundaryError(`${path} must be an object`);
  }
  return value as Fields;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new BoundaryError(`${path} must be an array`);
  }
  return value;
}

function u64(value: unknown, path: string): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new BoundaryError(`${path} must be a uint64 BigInt`);
  }
  return value;
}

function u32(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new BoundaryError(`${path} must be a uint32 number`);
  }
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new BoundaryError(`${path} must be a string`);
  }
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new BoundaryError(`${path} has unknown value ${JSON.stringify(String(value))}`);
  }
  return value as T;
}

function register(value: unknown, path: string): number {
  const index = u32(value, path);
  if (index >= REGISTER_COUNT) {
    throw new BoundaryError(`${path} must name a register R0-R${REGISTER_COUNT - 1}`);
  }
  return index;
}

export function parseTelemetry(raw: unknown): Telemetry {
  const t = record(raw, 'telemetry');
  const telemetry: Telemetry = {
    instructionsRetired: u64(t.instructionsRetired, 'telemetry.instructionsRetired'),
    cycles: u64(t.cycles, 'telemetry.cycles'),
    loads: u64(t.loads, 'telemetry.loads'),
    stores: u64(t.stores, 'telemetry.stores'),
    instructionBytes: u64(t.instructionBytes, 'telemetry.instructionBytes'),
    dataBytesRead: u64(t.dataBytesRead, 'telemetry.dataBytesRead'),
    dataBytesWritten: u64(t.dataBytesWritten, 'telemetry.dataBytesWritten'),
    bytesMoved: u64(t.bytesMoved, 'telemetry.bytesMoved'),
  };
  // Consistency check only: the core computes bytesMoved; the Web Lab verifies
  // the documented relation and refuses a snapshot that violates it.
  if (
    telemetry.bytesMoved !==
    telemetry.instructionBytes + telemetry.dataBytesRead + telemetry.dataBytesWritten
  ) {
    throw new BoundaryError('telemetry.bytesMoved violates the documented M0 relation');
  }
  return telemetry;
}

export function parseSnapshot(raw: unknown): MachineSnapshot {
  const s = record(raw, 'snapshot');
  const registers = list(s.registers, 'snapshot.registers');
  if (registers.length !== REGISTER_COUNT) {
    throw new BoundaryError(`snapshot.registers must contain ${REGISTER_COUNT} values`);
  }
  const status: MachineStatus = oneOf(s.status, MACHINE_STATUSES, 'snapshot.status');
  const fault: FaultCode = oneOf(s.fault, FAULT_CODES, 'snapshot.fault');
  if ((status === 'faulted') !== (fault !== 'none')) {
    throw new BoundaryError(`snapshot.status ${status} is inconsistent with fault ${fault}`);
  }
  return {
    status,
    fault,
    pc: u64(s.pc, 'snapshot.pc'),
    registers: registers.map((value, i) => u64(value, `snapshot.registers[${i}]`)),
    telemetry: parseTelemetry(s.telemetry),
  };
}

export function parseEvent(raw: unknown, path = 'event'): MachineEvent {
  const e = record(raw, path);
  const kind = text(e.kind, `${path}.kind`);
  switch (kind) {
    case 'instruction-fetch':
      return { kind, address: u64(e.address, `${path}.address`), size: u32(e.size, `${path}.size`) };
    case 'memory-read':
    case 'memory-write':
      return {
        kind,
        address: u64(e.address, `${path}.address`),
        size: u32(e.size, `${path}.size`),
        value: u64(e.value, `${path}.value`),
        reg: register(e.reg, `${path}.reg`),
      };
    case 'register-write':
      return { kind, reg: register(e.reg, `${path}.reg`), value: u64(e.value, `${path}.value`) };
    case 'instruction-retired':
      return { kind, address: u64(e.address, `${path}.address`), nextPc: u64(e.value, `${path}.value`) };
    case 'halted':
      return { kind, address: u64(e.address, `${path}.address`) };
    case 'faulted': {
      const fault = oneOf(e.fault, FAULT_CODES, `${path}.fault`);
      if (fault === 'none') {
        throw new BoundaryError(`${path} is a fault event without a fault code`);
      }
      return { kind, address: u64(e.address, `${path}.address`), fault };
    }
    default:
      throw new BoundaryError(`${path}.kind has unknown value ${JSON.stringify(kind)}`);
  }
}

export function parseEvents(raw: unknown): MachineEvent[] {
  return list(raw, 'events').map((event, i) => parseEvent(event, `events[${i}]`));
}

function parseProgramLine(raw: unknown, path: string): ProgramLine {
  const l = record(raw, path);
  const status: DecodeStatus = oneOf(l.status, DECODE_STATUSES, `${path}.status`);
  return {
    address: u64(l.address, `${path}.address`),
    length: u32(l.length, `${path}.length`),
    opcode: u32(l.opcode, `${path}.opcode`),
    status,
    text: text(l.text, `${path}.text`),
  };
}

export function parseProgram(raw: unknown): LoadedProgram | null {
  if (raw === null) {
    return null;
  }
  const p = record(raw, 'program');
  return {
    experimentId: text(p.experimentId, 'program.experimentId'),
    base: u64(p.base, 'program.base'),
    length: u32(p.length, 'program.length'),
    instructions: list(p.instructions, 'program.instructions').map((line, i) =>
      parseProgramLine(line, `program.instructions[${i}]`),
    ),
  };
}

export function parseExperiments(raw: unknown): ExperimentInfo[] {
  return list(raw, 'experiments').map((item, i) => {
    const e = record(item, `experiments[${i}]`);
    return {
      id: text(e.id, `experiments[${i}].id`),
      title: text(e.title, `experiments[${i}].title`),
      summary: text(e.summary, `experiments[${i}].summary`),
    };
  });
}
