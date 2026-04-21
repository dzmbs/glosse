// Applies vendored-library patches after `pnpm install`. Idempotent:
// safe to re-run. No-ops when the submodule hasn't been initialized yet,
// or when the patch is already applied.

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const PATCHES = [
  {
    name: "foliate-js-pdf-vite",
    submodule: "vendor/foliate-js",
    // Sentinel file — if it's missing, the submodule isn't initialized.
    sentinel: "vendor/foliate-js/pdf.js",
    patch: "patches/foliate-js-pdf-vite.patch",
  },
];

for (const p of PATCHES) {
  if (!existsSync(p.sentinel)) {
    // Submodule not initialized — that's fine on a fresh clone that
    // hasn't run `git submodule update --init` yet.
    continue;
  }

  // Already applied? `apply --reverse --check` succeeds only if the
  // patch *can* be reversed, i.e. it's currently applied.
  try {
    execSync(`git -C ${p.submodule} apply --reverse --check ../../${p.patch}`, {
      stdio: "ignore",
    });
    continue;
  } catch {
    // Not applied — proceed.
  }

  try {
    execSync(`git -C ${p.submodule} apply ../../${p.patch}`, {
      stdio: "inherit",
    });
    console.log(`[glosse] applied ${p.name}`);
  } catch (err) {
    console.error(
      `[glosse] failed to apply ${p.name}:`,
      err instanceof Error ? err.message : err,
    );
    process.exitCode = 1;
  }
}
