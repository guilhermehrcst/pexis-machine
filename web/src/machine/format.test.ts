import { describe, expect, it } from 'vitest';
import { addressWidth, byteCount, bytesHuman, decimal, describeEvent, hex64, hexAddress, hexByte } from './format';

describe('telemetry and value formatting', () => {
  it('formats 64-bit values as grouped hex', () => {
    expect(hex64(42n)).toBe('0x0000_0000_0000_002A');
    expect(hex64(0x0123456789abcdefn)).toBe('0x0123_4567_89AB_CDEF');
    expect(hex64(0xffff_ffff_ffff_ffffn)).toBe('0xFFFF_FFFF_FFFF_FFFF');
  });

  it('formats decimals beyond Number precision exactly', () => {
    expect(decimal(0n)).toBe('0');
    expect(decimal(1234567n)).toBe('1,234,567');
    expect(decimal(0xffff_ffff_ffff_ffffn)).toBe('18,446,744,073,709,551,615');
    expect(byteCount(47n)).toBe('47 B');
  });

  it('refuses values that are not uint64 instead of printing garbage', () => {
    expect(() => hex64(-1n)).toThrow(RangeError);
    expect(() => decimal(1n << 64n)).toThrow(RangeError);
    expect(() => hexByte(256)).toThrow(RangeError);
    expect(() => hexByte(Number.NaN)).toThrow(RangeError);
  });

  it('derives address width from the address space', () => {
    expect(addressWidth(64 * 1024)).toBe(4);
    expect(addressWidth(16 * 1024 * 1024)).toBe(6);
    expect(hexAddress(0x100n)).toBe('0x0100');
    expect(hexAddress(0x100, 6)).toBe('0x000100');
    expect(bytesHuman(65536)).toBe('64 KiB');
  });

  it('describes core events', () => {
    expect(describeEvent({ kind: 'memory-write', address: 0x100n, size: 8, value: 1n, reg: 0 })).toBe(
      'Write 8 B @ 0x0100 ← R0',
    );
    expect(describeEvent({ kind: 'faulted', address: 10n, fault: 'memory-out-of-bounds' })).toBe(
      'Fault: Memory out of bounds @ 0x000A',
    );
  });
});
