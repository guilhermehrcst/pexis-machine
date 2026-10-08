import { describe, expect, it } from 'vitest';
import { BoundaryError, parseEvents, parseExperiments, parseProgram, parseSnapshot } from './boundary';
import { rawEvent, rawSnapshot, rawTelemetry } from './fixtures';

describe('parseSnapshot', () => {
  it('parses a valid snapshot into typed values', () => {
    const snapshot = parseSnapshot(
      rawSnapshot({
        status: 'halted',
        pc: 24n,
        registers: [42n, 2n, 0n, 0n, 0n, 0n, 0n, 0xffff_ffff_ffff_ffffn],
        telemetry: rawTelemetry({ instructionsRetired: 4n, cycles: 4n, instructionBytes: 24n, bytesMoved: 24n }),
      }),
    );
    expect(snapshot.status).toBe('halted');
    expect(snapshot.pc).toBe(24n);
    expect(snapshot.registers[0]).toBe(42n);
    expect(snapshot.registers[7]).toBe(0xffff_ffff_ffff_ffffn);
    expect(snapshot.telemetry.bytesMoved).toBe(24n);
  });

  it.each([
    ['not an object', null],
    ['missing pc', rawSnapshot({ pc: undefined })],
    ['number instead of BigInt', rawSnapshot({ pc: 0 })],
    ['negative register', rawSnapshot({ registers: [-1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n] })],
    ['register above uint64', rawSnapshot({ registers: [1n << 64n, 0n, 0n, 0n, 0n, 0n, 0n, 0n] })],
    ['seven registers', rawSnapshot({ registers: [0n, 0n, 0n, 0n, 0n, 0n, 0n] })],
    ['unknown status', rawSnapshot({ status: 'sleeping' })],
    ['numeric status', rawSnapshot({ status: 2 })],
    ['unknown fault', rawSnapshot({ status: 'faulted', fault: 'cosmic-ray' })],
    ['faulted without fault code', rawSnapshot({ status: 'faulted', fault: 'none' })],
    ['fault code while not faulted', rawSnapshot({ status: 'running', fault: 'invalid-opcode' })],
    ['missing telemetry field', rawSnapshot({ telemetry: rawTelemetry({ loads: undefined }) })],
    ['NaN telemetry', rawSnapshot({ telemetry: rawTelemetry({ cycles: Number.NaN }) })],
    ['inconsistent bytesMoved', rawSnapshot({ telemetry: rawTelemetry({ instructionBytes: 10n, bytesMoved: 9n }) })],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseSnapshot(raw)).toThrow(BoundaryError);
  });
});

describe('parseEvents', () => {
  it('parses every event kind of the core contract', () => {
    const events = parseEvents([
      rawEvent({ kind: 'instruction-fetch', size: 10, address: 20n }),
      rawEvent({ kind: 'memory-read', size: 8, address: 0x100n, value: 7n, reg: 1 }),
      rawEvent({ kind: 'memory-write', size: 8, address: 0x100n, value: 7n, reg: 0 }),
      rawEvent({ kind: 'register-write', reg: 3, value: 42n, size: 0 }),
      rawEvent({ kind: 'instruction-retired', address: 20n, value: 30n, size: 0 }),
      rawEvent({ kind: 'halted', address: 30n, size: 0 }),
      rawEvent({ kind: 'faulted', fault: 'memory-out-of-bounds', address: 10n, size: 0 }),
    ]);
    expect(events.map((e) => e.kind)).toEqual([
      'instruction-fetch',
      'memory-read',
      'memory-write',
      'register-write',
      'instruction-retired',
      'halted',
      'faulted',
    ]);
    expect(events[0]).toEqual({ kind: 'instruction-fetch', address: 20n, size: 10 });
    expect(events[1]).toEqual({ kind: 'memory-read', address: 0x100n, size: 8, value: 7n, reg: 1 });
    expect(events[4]).toEqual({ kind: 'instruction-retired', address: 20n, nextPc: 30n });
    expect(events[6]).toEqual({ kind: 'faulted', address: 10n, fault: 'memory-out-of-bounds' });
  });

  it('accepts an empty event list (step on a halted machine)', () => {
    expect(parseEvents([])).toEqual([]);
  });

  it.each([
    ['non-array', {}],
    ['unknown kind', [rawEvent({ kind: 'cache-hit' })]],
    ['register write to R8', [rawEvent({ kind: 'register-write', reg: 8 })]],
    ['memory read without register', [rawEvent({ kind: 'memory-read', reg: 255 })]],
    ['fault event without fault code', [rawEvent({ kind: 'faulted', fault: 'none' })]],
    ['fractional size', [rawEvent({ size: 1.5 })]],
    ['number address', [rawEvent({ address: 0 })]],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseEvents(raw)).toThrow(BoundaryError);
  });
});

describe('parseProgram / parseExperiments', () => {
  it('accepts null program (nothing loaded)', () => {
    expect(parseProgram(null)).toBeNull();
  });

  it('parses a decoded program', () => {
    const program = parseProgram({
      experimentId: 'scalar-compute',
      base: 0n,
      length: 24,
      instructions: [{ address: 0n, length: 10, opcode: 16, status: 'ok', text: 'MOV R0, 40' }],
    });
    expect(program?.instructions[0]?.text).toBe('MOV R0, 40');
  });

  it('rejects an unknown decode status', () => {
    expect(() =>
      parseProgram({
        experimentId: 'x',
        base: 0n,
        length: 1,
        instructions: [{ address: 0n, length: 1, opcode: 0, status: 'maybe', text: 'NOP' }],
      }),
    ).toThrow(BoundaryError);
  });

  it('rejects malformed experiments', () => {
    expect(() => parseExperiments([{ id: 1, title: 't', summary: 's' }])).toThrow(BoundaryError);
  });
});
