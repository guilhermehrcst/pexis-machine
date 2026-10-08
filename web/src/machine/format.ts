// Presentation helpers. Pure formatting of values produced by the simulator;
// nothing here derives new metrics.

import type { FaultCode, MachineEvent, MachineStatus } from './types';

const U64_MAX = 0xffff_ffff_ffff_ffffn;

function assertU64(value: bigint): void {
  if (value < 0n || value > U64_MAX) {
    throw new RangeError(`value ${value} is not a uint64`);
  }
}

/** 0x0000_0000_0000_002A */
export function hex64(value: bigint): string {
  assertU64(value);
  const digits = value.toString(16).toUpperCase().padStart(16, '0');
  return `0x${digits.slice(0, 4)}_${digits.slice(4, 8)}_${digits.slice(8, 12)}_${digits.slice(12)}`;
}

/** Address with a fixed width derived from the address space (min 4 digits). */
export function hexAddress(value: bigint | number, width = 4): string {
  const v = typeof value === 'bigint' ? value : BigInt(value);
  assertU64(v);
  return `0x${v.toString(16).toUpperCase().padStart(width, '0')}`;
}

export function addressWidth(memorySize: number): number {
  const maxAddress = Math.max(0, memorySize - 1);
  return Math.max(4, maxAddress.toString(16).length);
}

export function hexByte(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`value ${value} is not a byte`);
  }
  return value.toString(16).toUpperCase().padStart(2, '0');
}

/** Decimal with thin grouping: 1,234,567 */
export function decimal(value: bigint): string {
  assertU64(value);
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function byteCount(value: bigint): string {
  return `${decimal(value)} B`;
}

export function bytesHuman(size: number): string {
  if (size >= 1024 * 1024 && size % (1024 * 1024) === 0) return `${size / (1024 * 1024)} MiB`;
  if (size >= 1024 && size % 1024 === 0) return `${size / 1024} KiB`;
  return `${size} B`;
}

export const STATUS_LABEL: Readonly<Record<MachineStatus, string>> = {
  ready: 'Ready',
  running: 'Running',
  halted: 'Halted',
  faulted: 'Faulted',
};

export const FAULT_LABEL: Readonly<Record<FaultCode, string>> = {
  none: 'None',
  'invalid-opcode': 'Invalid opcode',
  'invalid-register': 'Invalid register',
  'memory-out-of-bounds': 'Memory out of bounds',
  'truncated-instruction': 'Truncated instruction',
  'step-limit-exceeded': 'Step limit exceeded',
};

export function registerName(index: number): string {
  return `R${index}`;
}

/** One-line, human description of a core event. */
export function describeEvent(event: MachineEvent, width = 4): string {
  switch (event.kind) {
    case 'instruction-fetch':
      return `Fetch ${event.size} B @ ${hexAddress(event.address, width)}`;
    case 'memory-read':
      return `Read ${event.size} B @ ${hexAddress(event.address, width)} → ${registerName(event.reg)}`;
    case 'memory-write':
      return `Write ${event.size} B @ ${hexAddress(event.address, width)} ← ${registerName(event.reg)}`;
    case 'register-write':
      return `${registerName(event.reg)} ← ${hex64(event.value)}`;
    case 'instruction-retired':
      return `Retired @ ${hexAddress(event.address, width)}`;
    case 'halted':
      return `Halted @ ${hexAddress(event.address, width)}`;
    case 'faulted':
      return `Fault: ${FAULT_LABEL[event.fault]} @ ${hexAddress(event.address, width)}`;
  }
}
