#!/usr/bin/env bash
# Builds the Pexis Machine WebAssembly adapter and copies it into the Web Lab.
#
#   Requires: Emscripten (emsdk) activated in this shell, e.g.
#     source /path/to/emsdk/emsdk_env.sh
#
#   Output:   web/src/wasm/pexis-machine.js
#             web/src/wasm/pexis-machine.wasm
#
# The same command also builds the core test suite for WebAssembly; run it with
#   ctest --test-dir build-wasm --output-on-failure
set -euo pipefail

readonly EXPECTED_EMSCRIPTEN="4.0.23"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="${root}/build-wasm"
out_dir="${root}/web/src/wasm"

if ! command -v emcmake >/dev/null 2>&1; then
    echo "error: emcmake not found. Install emsdk ${EXPECTED_EMSCRIPTEN} and run 'source emsdk_env.sh'." >&2
    exit 1
fi

actual="$(emcc --version | head -n 1)"
if [[ "${actual}" != *" ${EXPECTED_EMSCRIPTEN} "* ]]; then
    echo "warning: expected Emscripten ${EXPECTED_EMSCRIPTEN}, found: ${actual}" >&2
fi

emcmake cmake -S "${root}" -B "${build_dir}" -DCMAKE_BUILD_TYPE=Release -DPEXIS_MACHINE_BUILD_TESTS=ON
cmake --build "${build_dir}" --parallel

cp "${build_dir}/pexis-machine.js" "${build_dir}/pexis-machine.wasm" "${out_dir}/"
echo "WebAssembly adapter written to ${out_dir}"
