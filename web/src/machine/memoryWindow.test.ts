import { describe, expect, it } from 'vitest';
import { PAGE_BYTES, addressInRam, memoryWindow, parseAddress } from './memoryWindow';

const RAM = 64 * 1024;

describe('memoryWindow bounds', () => {
  it('aligns to rows and stays inside RAM', () => {
    expect(memoryWindow(0, RAM)).toEqual({ start: 0, length: PAGE_BYTES });
    expect(memoryWindow(0x105, RAM)).toEqual({ start: 0x100, length: PAGE_BYTES });
  });

  it('clamps past-the-end requests to the last full page', () => {
    expect(memoryWindow(RAM, RAM)).toEqual({ start: RAM - PAGE_BYTES, length: PAGE_BYTES });
    expect(memoryWindow(Number.MAX_SAFE_INTEGER, RAM)).toEqual({ start: RAM - PAGE_BYTES, length: PAGE_BYTES });
  });

  it('clamps negative and non-finite requests to zero', () => {
    expect(memoryWindow(-16, RAM).start).toBe(0);
    expect(memoryWindow(Number.NaN, RAM).start).toBe(0);
    expect(memoryWindow(Number.POSITIVE_INFINITY, RAM).start).toBe(0);
  });

  it('handles RAM smaller than a page', () => {
    expect(memoryWindow(100, 40)).toEqual({ start: 0, length: 40 });
    expect(memoryWindow(0, 0)).toEqual({ start: 0, length: 0 });
  });

  it('never produces a window that reaches past RAM', () => {
    for (const request of [-1, 0, 1, 255, 256, RAM - 1, RAM, RAM + 1, 1e12]) {
      const window = memoryWindow(request, RAM);
      expect(window.start % 16).toBe(0);
      expect(window.start + window.length).toBeLessThanOrEqual(RAM);
    }
  });
});

describe('parseAddress', () => {
  it.each([
    ['0x100', 256],
    ['0X1_00', 256],
    ['100h', 256],
    ['256', 256],
    [' 0x0 ', 0],
  ])('parses %s', (input, expected) => {
    expect(parseAddress(input)).toBe(expected);
  });

  it.each(['', 'abc', '-1', '0x', '1e3', '0x1g', '<b>'])('rejects %s', (input) => {
    expect(parseAddress(input)).toBeNull();
  });

  it('maps simulator addresses into RAM or null', () => {
    expect(addressInRam(0x100n, RAM)).toBe(256);
    expect(addressInRam(BigInt(RAM), RAM)).toBeNull();
  });
});
