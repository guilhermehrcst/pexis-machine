// Maps core events to visual data transfers. This is the only place where the
// 3D layer decides what moves; it decides exclusively from events the
// simulator emitted. It never infers movement from changed numbers.

import type { MachineEvent } from '../machine/types';

export type ComponentId = 'cpu' | 'ram' | 'interconnect' | 'gpu';

export type TransferKind = 'fetch' | 'read' | 'write';

export interface Transfer {
  readonly kind: TransferKind;
  readonly from: 'ram' | 'cpu';
  readonly to: 'ram' | 'cpu';
  readonly bytes: number;
  readonly address: bigint;
}

export type CpuSignal = 'retired' | 'halted' | 'faulted' | null;

export interface StepVisual {
  /** Transfers in the order the core reported them. */
  readonly transfers: readonly Transfer[];
  readonly cpu: CpuSignal;
}

export function transferFor(event: MachineEvent): Transfer | null {
  switch (event.kind) {
    // M0 instructions live in the same RAM as data: fetch travels RAM -> CPU.
    case 'instruction-fetch':
      return { kind: 'fetch', from: 'ram', to: 'cpu', bytes: event.size, address: event.address };
    case 'memory-read':
      return { kind: 'read', from: 'ram', to: 'cpu', bytes: event.size, address: event.address };
    case 'memory-write':
      return { kind: 'write', from: 'cpu', to: 'ram', bytes: event.size, address: event.address };
    case 'register-write':
    case 'instruction-retired':
    case 'halted':
    case 'faulted':
      return null;
  }
}

export function visualizeStep(events: readonly MachineEvent[]): StepVisual {
  const transfers: Transfer[] = [];
  let cpu: CpuSignal = null;
  for (const event of events) {
    const transfer = transferFor(event);
    if (transfer !== null && transfer.bytes > 0) {
      transfers.push(transfer);
    }
    if (event.kind === 'faulted') cpu = 'faulted';
    else if (event.kind === 'halted') cpu = 'halted';
    else if (event.kind === 'instruction-retired' && cpu === null) cpu = 'retired';
  }
  return { transfers, cpu };
}
