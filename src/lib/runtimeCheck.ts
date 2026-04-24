/**
 * Detect runtime conditions that block the reader or the AI database.
 * All signals are read once at module load and cached — SES lockdown and
 * cross-origin isolation are set before our code runs and don't change
 * mid-session.
 */

export type RuntimeConcern =
  | "no-shared-array-buffer"
  | "not-cross-origin-isolated"
  | "ses-lockdown"
  | "wallet-injection";

export type RuntimeReport = {
  concerns: RuntimeConcern[];
  walletNames: string[];
  blocksAI: boolean;
};

function detectWallets(): string[] {
  const g = globalThis as Record<string, unknown>;
  const names: string[] = [];
  if (g.ethereum) names.push("Ethereum (MetaMask / Rabby / Brave Wallet / Opera Wallet)");
  if (g.solana) names.push("Solana (Phantom / Solflare / Backpack)");
  if (g.tronWeb || g.tronLink) names.push("TronLink");
  if (g.BinanceChain) names.push("Binance Wallet");
  return names;
}

function detectLockdown(): boolean {
  // SES/MetaMask lockdown freezes the built-in prototypes. This is the
  // cheapest reliable signature — no wallet leaves these frozen on a
  // vanilla page.
  try {
    return Object.isFrozen(Object.prototype);
  } catch {
    return false;
  }
}

export function getRuntimeReport(): RuntimeReport {
  const concerns: RuntimeConcern[] = [];
  const walletNames = detectWallets();
  const hasSAB = typeof SharedArrayBuffer !== "undefined";
  const isolated = !!globalThis.crossOriginIsolated;

  if (!hasSAB) concerns.push("no-shared-array-buffer");
  if (!isolated) concerns.push("not-cross-origin-isolated");
  if (detectLockdown()) concerns.push("ses-lockdown");
  if (walletNames.length > 0) concerns.push("wallet-injection");

  // The AI database depends on SAB for its Turso WASM worker. Everything
  // else is a smell but not a hard block.
  const blocksAI = !hasSAB || !isolated;

  return { concerns, walletNames, blocksAI };
}

/**
 * Human-readable guidance for the detected concerns. Returns null when
 * nothing notable is going on.
 */
export function describeRuntimeConcerns(report: RuntimeReport): {
  title: string;
  detail: string;
  severity: "warning" | "error";
} | null {
  if (report.concerns.length === 0) return null;

  if (report.blocksAI) {
    return {
      severity: "error",
      title: "The AI database can't start in this browser.",
      detail:
        "SharedArrayBuffer is unavailable, which means the local AI database worker can't boot. Most often this is a crypto wallet extension running SES lockdown on every page. Try: disable the wallet on localhost, open this URL in a private window, or switch to a browser profile with no wallet extensions.",
    };
  }

  if (report.concerns.includes("ses-lockdown") || report.concerns.includes("wallet-injection")) {
    return {
      severity: "warning",
      title: "A browser extension is modifying this page.",
      detail: `Detected: ${report.walletNames.join(", ") || "SES lockdown"}. The reader usually still works, but if clicks stop responding or pages won't turn, disable the wallet or open in a private window.`,
    };
  }

  return null;
}
