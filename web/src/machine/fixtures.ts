// Raw values shaped exactly like the WebAssembly adapter's output.

export function rawTelemetry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    instructionsRetired: 0n,
    cycles: 0n,
    loads: 0n,
    stores: 0n,
    instructionBytes: 0n,
    dataBytesRead: 0n,
    dataBytesWritten: 0n,
    bytesMoved: 0n,
    ...overrides,
  };
}

export function rawSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'ready',
    fault: 'none',
    pc: 0n,
    registers: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
    telemetry: rawTelemetry(),
    ...overrides,
  };
}

export function rawEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind: 'instruction-fetch', fault: 'none', reg: 255, size: 10, address: 0n, value: 0n, ...overrides };
}
