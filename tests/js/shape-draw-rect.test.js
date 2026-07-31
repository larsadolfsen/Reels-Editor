const test = require("node:test");
const assert = require("node:assert");
const { fromPoints } = require("../../static/shape-draw-rect.js");

test("fromPoints: drag down-right normalizes to the start point as top-left", () => {
  const r = fromPoints({ x: 100, y: 200 }, { x: 300, y: 500 });
  assert.deepStrictEqual(r, { x: 100, y: 200, width: 200, height: 300 });
});

test("fromPoints: drag up-left normalizes to the end point as top-left", () => {
  const r = fromPoints({ x: 300, y: 500 }, { x: 100, y: 200 });
  assert.deepStrictEqual(r, { x: 100, y: 200, width: 200, height: 300 });
});

test("fromPoints: drag down-left normalizes x from the leftmost point", () => {
  const r = fromPoints({ x: 300, y: 200 }, { x: 100, y: 500 });
  assert.deepStrictEqual(r, { x: 100, y: 200, width: 200, height: 300 });
});

test("fromPoints: drag up-right normalizes y from the topmost point", () => {
  const r = fromPoints({ x: 100, y: 500 }, { x: 300, y: 200 });
  assert.deepStrictEqual(r, { x: 100, y: 200, width: 200, height: 300 });
});

test("fromPoints: clamps points outside the canvas bounds", () => {
  const r = fromPoints({ x: -50, y: -50 }, { x: 1200, y: 2000 });
  assert.deepStrictEqual(r, { x: 0, y: 0, width: 1080, height: 1920 });
});

test("fromPoints: degenerate zero-size drag (same point twice)", () => {
  const r = fromPoints({ x: 400, y: 600 }, { x: 400, y: 600 });
  assert.deepStrictEqual(r, { x: 400, y: 600, width: 0, height: 0 });
});
