// Type contract of the generated Emscripten module (`npm run wasm:build`).
// Source of the module: wasm/bindings.cpp. ABI version 1.
//
// Values returned by the module are deliberately typed `unknown`: they cross a
// language boundary and are validated by src/machine/boundary.ts before use.

export interface WasmWebMachine {
  abiVersion(): number;
  memorySize(): number;
  experiments(): unknown;
  loadExperiment(id: string): boolean;
  reset(): void;
  step(): void;
  snapshot(): unknown;
  lastEvents(): unknown;
  readMemory(address: number, length: number): Uint8Array | null;
  program(): unknown;
  delete(): void;
}

export interface PexisMachineModule {
  WebMachine: new () => WasmWebMachine;
}

declare function createPexisMachine(options?: Record<string, unknown>): Promise<PexisMachineModule>;
export default createPexisMachine;
