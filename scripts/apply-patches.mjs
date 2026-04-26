// Applies vendored-library patches after `pnpm install`. Idempotent:
// safe to re-run. No-ops when the submodule hasn't been initialized.

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const SUBMODULE = "vendor/foliate-js";
const SENTINEL = "vendor/foliate-js/pdf.js";
const PATCHES = [
  "patches/foliate-js-pdf-vite-assets.patch",
  "patches/foliate-js-pdf-text-selection.patch",
  "patches/foliate-js-pdf-create-document.patch",
];

if (!existsSync(SENTINEL)) {
  process.exit(0);
}

for (const patch of PATCHES) {
  try {
    execSync(`git -C ${SUBMODULE} apply --reverse --check ../../${patch}`, {
      stdio: "ignore",
    });
    continue;
  } catch {
    // not applied — proceed
  }

  try {
    execSync(`git -C ${SUBMODULE} apply ../../${patch}`, {
      stdio: "inherit",
    });
    console.log(`[glosse] applied ${patch}`);
  } catch (err) {
    console.error(
      `[glosse] failed to apply ${patch}:`,
      err instanceof Error ? err.message : err,
    );
    process.exitCode = 1;
  }
}
