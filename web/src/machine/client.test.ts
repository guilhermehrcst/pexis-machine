import { describe, expect, it } from 'vitest';
import type { WasmWebMachine } from '../wasm/pexis-machine';
import { BoundaryError } from './boundary';
import { MachineClient } from './client';
import { rawSnapshot } from './fixtures';

function fakeMachine(overrides: Partial<WasmWebMachine> = {}): WasmWebMachine & { deleted: boolean } {
  const fake = {
    deleted: false,
    abiVersion: () => 1,
    memorySize: () => 65536,
    experiments: () => [{ id: 'scalar-compute', title: 'Scalar Compute', summary: '' }],
    loadExperiment: () => true,
    reset: () => undefined,
    step: () => undefined,
    snapshot: () => rawSnapshot(),
    lastEvents: () => [],
    readMemory: (_address: number, length: number) => new Uint8Array(length),
    program: () => null,
    delete() {
      fake.deleted = true;
    },
    ...overrides,
  };
  return fake;
}

describe('MachineClient (adapter contract)', () => {
  it('refuses an ABI mismatch and releases the native object', () => {
    const machine = fakeMachine({ abiVersion: () => 2 });
    expect(() => new MachineClient(machine)).toThrow(BoundaryError);
    expect(machine.deleted).toBe(true);
  });

  it('rejects unknown experiments before touching the machine', () => {
    let loads = 0;
    const client = new MachineClient(
      fakeMachine({
        loadExperiment: () => {
          loads += 1;
          return true;
        },
      }),
    );
    expect(() => client.load('gpu-vector-add')).toThrow(RangeError);
    expect(loads).toBe(0);
  });

  it('fails closed when the adapter returns a malformed snapshot', () => {
    const client = new MachineClient(fakeMachine({ snapshot: () => ({ status: 'ready' }) }));
    expect(() => client.step()).toThrow(BoundaryError);
  });

  it.each([
    [-1, 1],
    [0, -1],
    [0.5, 1],
    [65535, 2],
    [0, 4097],
    [Number.NaN, 1],
  ])('rejects memory range (%s, %s) without calling the adapter', (address, length) => {
    let calls = 0;
    const client = new MachineClient(
      fakeMachine({
        readMemory: () => {
          calls += 1;
          return new Uint8Array(0);
        },
      }),
    );
    expect(() => client.readMemory(address, length)).toThrow(RangeError);
    expect(calls).toBe(0);
  });

  it('rejects an adapter that returns the wrong amount of memory', () => {
    const client = new MachineClient(fakeMachine({ readMemory: () => new Uint8Array(3) }));
    expect(() => client.readMemory(0, 16)).toThrow(BoundaryError);
  });

  it('refuses every call after dispose', () => {
    const machine = fakeMachine();
    const client = new MachineClient(machine);
    client.dispose();
    expect(machine.deleted).toBe(true);
    expect(() => client.step()).toThrow(/disposed/);
    expect(() => client.state()).toThrow(/disposed/);
  });
});
