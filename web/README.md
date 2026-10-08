# Pexis Machine Web Lab

The Web Lab will be the interactive 3D observation and experiment surface for Pexis Machine.

M0 intentionally does not implement rendering yet. First the simulator establishes a deterministic state contract. The planned boundary is:

```text
C++ simulation core
        |
        v
   WebAssembly
        |
        v
state snapshot + explicit machine events
        |
        v
Three.js 3D Web Lab
```

The Web Lab must not duplicate CPU semantics, memory semantics, or telemetry calculations in JavaScript. Its job is to visualize and control the simulator through a narrow adapter.
