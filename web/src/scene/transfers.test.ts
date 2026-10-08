import { describe, expect, it } from 'vitest';
import type { MachineEvent } from '../machine/types';
import { transferFor, visualizeStep } from './transfers';

describe('event → transfer mapping', () => {
  it('maps fetch and LOAD to RAM → CPU and STORE to CPU → RAM', () => {
    expect(transferFor({ kind: 'instruction-fetch', address: 0n, size: 10 })).toMatchObject({
      kind: 'fetch',
      from: 'ram',
      to: 'cpu',
      bytes: 10,
    });
    expect(transferFor({ kind: 'memory-read', address: 0x100n, size: 8, value: 1n, reg: 1 })).toMatchObject({
      kind: 'read',
      from: 'ram',
      to: 'cpu',
    });
    expect(transferFor({ kind: 'memory-write', address: 0x100n, size: 8, value: 1n, reg: 0 })).toMatchObject({
      kind: 'write',
      from: 'cpu',
      to: 'ram',
    });
  });

  it('never moves data for events that are internal to the CPU', () => {
    expect(transferFor({ kind: 'register-write', reg: 0, value: 42n })).toBeNull();
    expect(transferFor({ kind: 'instruction-retired', address: 0n, nextPc: 10n })).toBeNull();
    expect(transferFor({ kind: 'halted', address: 0n })).toBeNull();
    expect(transferFor({ kind: 'faulted', address: 0n, fault: 'invalid-opcode' })).toBeNull();
  });

  it('keeps core order and summarizes CPU outcome', () => {
    const load: MachineEvent[] = [
      { kind: 'instruction-fetch', address: 20n, size: 10 },
      { kind: 'memory-read', address: 0x100n, size: 8, value: 1n, reg: 1 },
      { kind: 'register-write', reg: 1, value: 1n },
      { kind: 'instruction-retired', address: 20n, nextPc: 30n },
    ];
    const visual = visualizeStep(load);
    expect(visual.transfers.map((t) => t.kind)).toEqual(['fetch', 'read']);
    expect(visual.cpu).toBe('retired');

    const fault = visualizeStep([
      { kind: 'instruction-fetch', address: 10n, size: 10 },
      { kind: 'faulted', address: 10n, fault: 'memory-out-of-bounds' },
    ]);
    expect(fault.transfers.map((t) => t.kind)).toEqual(['fetch']);
    expect(fault.cpu).toBe('faulted');
  });

  it('produces nothing when the core reported nothing', () => {
    expect(visualizeStep([])).toEqual({ transfers: [], cpu: null });
  });
});
