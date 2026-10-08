// Paged window over RAM for the memory viewer. Only one page is ever read from
// the simulator and rendered, never the whole address space.

export const BYTES_PER_ROW = 16;
export const ROWS_PER_PAGE = 16;
export const PAGE_BYTES = BYTES_PER_ROW * ROWS_PER_PAGE;

export interface MemoryWindow {
  /** First address of the page; always row-aligned and inside RAM. */
  readonly start: number;
  /** Number of bytes in the page; never reaches past the end of RAM. */
  readonly length: number;
}

/**
 * Normalizes any requested start address into a valid, row-aligned window.
 * Non-finite or negative input clamps to 0; input past the end clamps to the
 * last full page.
 */
export function memoryWindow(requestedStart: number, memorySize: number): MemoryWindow {
  if (!Number.isSafeInteger(memorySize) || memorySize <= 0) {
    return { start: 0, length: 0 };
  }
  const lastStart = Math.max(0, alignDown(memorySize - PAGE_BYTES));
  const requested = Number.isFinite(requestedStart) ? Math.trunc(requestedStart) : 0;
  const start = Math.min(Math.max(0, alignDown(requested)), lastStart);
  return { start, length: Math.min(PAGE_BYTES, memorySize - start) };
}

export function alignDown(address: number): number {
  return Math.floor(address / BYTES_PER_ROW) * BYTES_PER_ROW;
}

/** Parses "0x100", "100h", "256" style user input. Returns null if invalid. */
export function parseAddress(input: string): number | null {
  const trimmed = input.trim().toLowerCase().replace(/_/g, '');
  let value: number;
  if (/^0x[0-9a-f]+$/.test(trimmed)) {
    value = Number.parseInt(trimmed.slice(2), 16);
  } else if (/^[0-9a-f]+h$/.test(trimmed)) {
    value = Number.parseInt(trimmed.slice(0, -1), 16);
  } else if (/^[0-9]+$/.test(trimmed)) {
    value = Number.parseInt(trimmed, 10);
  } else {
    return null;
  }
  return Number.isSafeInteger(value) ? value : null;
}

/** Converts a simulator address to a safe number if it lies inside RAM. */
export function addressInRam(address: bigint, memorySize: number): number | null {
  if (address < 0n || address >= BigInt(memorySize)) {
    return null;
  }
  return Number(address);
}
