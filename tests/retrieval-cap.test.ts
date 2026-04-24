import test from "node:test";
import assert from "node:assert/strict";

import { effectivePoolMaxPage } from "../src/ai/retrieval/cap.ts";

test("stricter maxPage wins when it's lower than currentPage (spoiler cap holds)", () => {
  // The scenario that motivated the fix: caller passes maxPage=30
  // while the reader is on page 100. Local/focus/overview pools used
  // to leak up to 100; now they must cap at 30.
  assert.equal(effectivePoolMaxPage(30, 100), 30);
});

test("currentPage wins when it's the tighter bound", () => {
  assert.equal(effectivePoolMaxPage(500, 40), 40);
});

test("maxPage alone is used when currentPage is undefined", () => {
  assert.equal(effectivePoolMaxPage(50, undefined), 50);
});

test("currentPage alone is used when maxPage is undefined", () => {
  assert.equal(effectivePoolMaxPage(undefined, 75), 75);
});

test("both undefined returns undefined (uncapped)", () => {
  assert.equal(effectivePoolMaxPage(undefined, undefined), undefined);
});

test("equal values yield the same value — no drift on the equality case", () => {
  assert.equal(effectivePoolMaxPage(42, 42), 42);
});

test("zero / negative caps are returned as-is (SQL layer handles empty result)", () => {
  // If the caller ever passes 0 we pass it through; buildPageFilter
  // will generate `page_number <= 0` and no rows will match. That's
  // the correct behavior — don't silently widen.
  assert.equal(effectivePoolMaxPage(0, 100), 0);
  assert.equal(effectivePoolMaxPage(100, 0), 0);
});
