/**
 * The cap that every pool below the top-level broad/FTS pair must
 * respect in `hybridRetrieve`. Returns the tightest of (caller-provided
 * `maxPage`, current reader page). Kept as a pure module — no DB, no
 * provider imports — so Node tests can cover the tightening contract
 * without booting the Turso WASM or embedding stack.
 */
export function effectivePoolMaxPage(
  maxPage: number | undefined,
  currentPage: number | undefined,
): number | undefined {
  if (maxPage !== undefined && currentPage !== undefined) {
    return Math.min(maxPage, currentPage);
  }
  return maxPage ?? currentPage;
}
