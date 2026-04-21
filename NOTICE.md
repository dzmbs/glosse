# Third-party code

glosse vendors the following libraries under their respective licenses.
Each library keeps its own copyright and license notice in its source tree.

## foliate-js

- Location: `vendor/foliate-js/`
- Upstream: https://github.com/johnfactotum/foliate-js
- License: MIT (© John Factotum)
- Included as a git submodule. foliate-js itself bundles:
  - `@zip.js/zip.js` — BSD-3-Clause (© Gildas Lormeau)
  - `fflate` — MIT (© Arjun Barrett)
  - `PDF.js` — Apache 2.0 (© Mozilla)

## Local patches to vendored code

- `patches/foliate-js-pdf-vite.patch` — prefixes `./` to the `new URL()`
  template in `vendor/foliate-js/pdf.js`. Upstream works in plain browsers
  but Vite's `import-glob` plugin requires relative globs to start with
  `./` or `/`. Applied automatically by `scripts/apply-patches.mjs` on
  `pnpm install` (idempotent — safe to re-run after submodule updates).

glosse's own source code is MIT-licensed.
