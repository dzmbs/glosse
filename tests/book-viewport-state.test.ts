import test from "node:test";
import assert from "node:assert/strict";

import {
  diffViewportHighlights,
  parseSelectionPageNumber,
} from "../src/components/bookViewportState.ts";

test("diffViewportHighlights adds new highlights and removes stale ones", () => {
  const rendered = new Map([
    ["epubcfi(/6/2)", "yellow"],
    ["epubcfi(/6/4)", "blue"],
  ]);

  const diff = diffViewportHighlights(rendered, [
    { cfi: "epubcfi(/6/2)", color: "yellow" },
    { cfi: "epubcfi(/6/6)", color: "green" },
  ]);

  assert.deepEqual(diff, {
    toAdd: [{ cfi: "epubcfi(/6/6)", color: "green" }],
    toRemove: ["epubcfi(/6/4)"],
  });
});

test("parseSelectionPageNumber only keeps numeric page labels", () => {
  assert.equal(parseSelectionPageNumber("74"), 74);
  assert.equal(parseSelectionPageNumber("Page 128"), 128);
  assert.equal(parseSelectionPageNumber("xiii"), null);
  assert.equal(parseSelectionPageNumber(null), null);
});
