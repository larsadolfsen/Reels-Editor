const test = require("node:test");
const assert = require("node:assert");
const { anchoredPosition } = require("../../static/resize-anchor.js");

test("east/south drag keeps the top-left corner fixed", () => {
  const pos = anchoredPosition(100, 200, 300, 400, 500, 600, "se");
  assert.deepStrictEqual(pos, { x: 100, y: 200 });
});

test("west drag shifts x so the right edge stays fixed", () => {
  // right edge was at 100 + 300 = 400; growing to width 500 must keep it at 400
  const pos = anchoredPosition(100, 200, 300, 400, 500, 400, "w");
  assert.deepStrictEqual(pos, { x: -100, y: 200 });
});

test("north drag shifts y so the bottom edge stays fixed", () => {
  // bottom edge was at 200 + 400 = 600; growing to height 600 must keep it at 600
  const pos = anchoredPosition(100, 200, 300, 400, 300, 600, "n");
  assert.deepStrictEqual(pos, { x: 100, y: 0 });
});

test("northwest drag shifts both x and y", () => {
  const pos = anchoredPosition(100, 200, 300, 400, 350, 450, "nw");
  assert.deepStrictEqual(pos, { x: 50, y: 150 });
});

test("shrinking on the west/north axes shifts the anchor the other way", () => {
  const pos = anchoredPosition(100, 200, 300, 400, 200, 400, "w");
  assert.deepStrictEqual(pos, { x: 200, y: 200 });
});
