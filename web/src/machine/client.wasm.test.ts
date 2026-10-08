// Integration tests against the real C++ core compiled to WebAssembly.
// These prove the Web Lab drives the same Machine that the native tests verify.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import createPexisMachine from '../wasm/pexis-machine.js';
import type { PexisMachineModule } from '../wasm/pexis-machine';
import { MachineClient, type StepOutcome } from './client';
import { RunController, type Scheduler, type StopReason } from './runner';

let module: PexisMachineModule;
let client: MachineClient;

beforeAll(async () => {
  module = await createPexisMachine();
});

afterEach(() => {
  client?.dispose();
});

function open(): MachineClient {
  client = MachineClient.fromModule(module);
  return client;
}

function stepUntilTerminal(c: MachineClient): StepOutcome[] {
  const outcomes: StepOutcome[] = [];
  for (let i = 0; i < 100; i += 1) {
    const outcome = c.step();
    outcomes.push(outcome);
    if (outcome.snapshot.status === 'halted' || outcome.snapshot.status === 'faulted') break;
  }
  return outcomes;
}

describe('real WebAssembly machine', () => {
  it('exposes the C++ experiment catalog and no GPU experiment', () => {
    const c = open();
    expect(c.memorySize).toBe(65536);
    expect(c.experiments.map((e) => e.id)).toEqual(['scalar-compute', 'memory-transfer', 'bounds-fault']);
  });

  it('Scalar Compute: step by step to R0 = 42 and HALTED', () => {
    const c = open();
    const loaded = c.load('scalar-compute');
    expect(loaded.snapshot.status).toBe('ready');
    expect(loaded.snapshot.pc).toBe(0n);
    expect(loaded.program?.instructions.map((l) => l.text)).toEqual([
      'MOV R0, 40',
      'MOV R1, 2',
      'ADD R0, R1',
      'HALT',
    ]);

    const first = c.step();
    expect(first.snapshot.pc).toBe(10n);
    expect(first.snapshot.registers[0]).toBe(40n);
    expect(first.events).toEqual([
      { kind: 'instruction-fetch', address: 0n, size: 10 },
      { kind: 'register-write', reg: 0, value: 40n },
      { kind: 'instruction-retired', address: 0n, nextPc: 10n },
    ]);

    c.step();
    c.step();
    const last = c.step();
    expect(last.snapshot.status).toBe('halted');
    expect(last.snapshot.registers[0]).toBe(42n);
    expect(last.snapshot.telemetry.instructionsRetired).toBe(4n);
    expect(last.snapshot.telemetry.bytesMoved).toBe(24n);
    expect(last.events.at(-1)).toEqual({ kind: 'halted', address: 23n });

    const after = c.step();
    expect(after.events).toEqual([]);
    expect(after.snapshot).toEqual(last.snapshot);
  });

  it('Memory Transfer: STORE is CPU → RAM, LOAD is RAM → CPU, RAM holds the bytes', () => {
    const c = open();
    c.load('memory-transfer');
    const outcomes = stepUntilTerminal(c);
    expect(outcomes).toHaveLength(4);

    const store = outcomes[1]!;
    expect(store.events[1]).toEqual({ kind: 'memory-write', address: 0x100n, size: 8, value: 0x0123456789abcdefn, reg: 0 });
    expect(store.snapshot.telemetry.stores).toBe(1n);
    expect(store.snapshot.telemetry.dataBytesWritten).toBe(8n);

    const load = outcomes[2]!;
    expect(load.events[1]).toEqual({ kind: 'memory-read', address: 0x100n, size: 8, value: 0x0123456789abcdefn, reg: 1 });
    expect(load.snapshot.registers[1]).toBe(0x0123456789abcdefn);

    const final = outcomes.at(-1)!.snapshot;
    expect(final.telemetry.loads).toBe(1n);
    expect(final.telemetry.bytesMoved).toBe(47n);
    expect(Array.from(c.readMemory(0x100, 8))).toEqual([0xef, 0xcd, 0xab, 0x89, 0x67, 0x45, 0x23, 0x01]);
  });

  it('Bounds Fault: fails closed with no false effects', () => {
    const c = open();
    c.load('bounds-fault');
    const outcomes = stepUntilTerminal(c);
    const fault = outcomes.at(-1)!;
    expect(fault.snapshot.status).toBe('faulted');
    expect(fault.snapshot.fault).toBe('memory-out-of-bounds');
    expect(fault.snapshot.pc).toBe(10n);
    expect(fault.snapshot.registers[1]).toBe(0n);
    expect(fault.events.map((e) => e.kind)).toEqual(['instruction-fetch', 'faulted']);
    expect(c.step().events).toEqual([]);
  });

  it('event totals equal core telemetry across every experiment', () => {
    const c = open();
    for (const experiment of c.experiments) {
      c.load(experiment.id);
      let fetched = 0n;
      let read = 0n;
      let written = 0n;
      let retired = 0n;
      const outcomes = stepUntilTerminal(c);
      for (const { events } of outcomes) {
        for (const e of events) {
          if (e.kind === 'instruction-fetch') fetched += BigInt(e.size);
          if (e.kind === 'memory-read') read += BigInt(e.size);
          if (e.kind === 'memory-write') written += BigInt(e.size);
          if (e.kind === 'instruction-retired') retired += 1n;
        }
      }
      const t = outcomes.at(-1)!.snapshot.telemetry;
      expect([fetched, read, written, retired]).toEqual([
        t.instructionBytes,
        t.dataBytesRead,
        t.dataBytesWritten,
        t.instructionsRetired,
      ]);
    }
  });

  it('reset reloads the experiment and clears state; switching experiments replaces RAM', () => {
    const c = open();
    c.load('memory-transfer');
    stepUntilTerminal(c);
    const reset = c.reset();
    expect(reset.snapshot.status).toBe('ready');
    expect(reset.snapshot.telemetry.bytesMoved).toBe(0n);
    expect(Array.from(c.readMemory(0x100, 8))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);

    const scalar = c.load('scalar-compute');
    expect(scalar.program?.experimentId).toBe('scalar-compute');
    expect(c.readMemory(0, 1)[0]).toBe(0x10);
  });

  it('memory inspection does not change telemetry', () => {
    const c = open();
    c.load('scalar-compute');
    const before = c.state().snapshot;
    c.readMemory(0, 4096);
    c.readMemory(65536 - 16, 16);
    expect(c.state().snapshot).toEqual(before);
  });

  it('RunController drives the real core to HALT and stops by itself', () => {
    const c = open();
    c.load('scalar-compute');
    const pending: Array<() => void> = [];
    const scheduler: Scheduler = {
      setTimeout: (callback) => pending.push(callback),
      clearTimeout: () => undefined,
    };
    const stops: StopReason[] = [];
    const controller = new RunController({
      step: () => c.step(),
      onTick: () => undefined,
      onStop: (reason) => stops.push(reason),
      scheduler,
    });
    controller.start();
    while (pending.length > 0 && controller.running) pending.shift()!();
    expect(stops).toEqual(['halted']);
    expect(c.state().snapshot.registers[0]).toBe(42n);
  });
});
