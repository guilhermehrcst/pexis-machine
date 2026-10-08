# GitHub Pages deployment

The Web Lab is deployed from `main` using GitHub Actions.

Expected project URL:

```text
https://guilhermehrcst.github.io/pexis-machine/
```

The deployment workflow is `.github/workflows/pages.yml`.

## Build contract

Pages deployment must build the real WebAssembly adapter before Vite:

```text
C++ core
  ↓
Emscripten
  ↓
web/src/wasm/pexis-machine.{js,wasm}
  ↓
Vite production build
  ↓
web/dist
  ↓
GitHub Pages
```

The Pages build sets `VITE_BASE_PATH=/pexis-machine/`. Local development keeps the default base path `/`.

The Web Lab imports the generated WASM file with Vite's `?url` asset handling and passes its emitted URL to
Emscripten via `locateFile`. This keeps the simulator binary reachable below the Pages project path after bundling.

The existing `CI` workflow also compiles and validates the production bundle with the Pages base before a PR
can be merged. It asserts that the generated `dist` contains the expected root path and `.wasm` asset.

The deployment does not commit generated WASM or `web/dist` artifacts to the repository.

## Repository setting

GitHub Pages must use **GitHub Actions** as its build and deployment source:

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```

If Pages has not been enabled for the repository yet, the first deployment can fail until that setting is selected.
