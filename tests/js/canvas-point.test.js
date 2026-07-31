const test = require("node:test");
const assert = require("node:assert");
const { fromClient } = require("../../static/canvas-point.js");

function rect(left, top, width, height) {
  return { left, top, width, height };
}

test("fromClient maps the overlay's top-left to canvas (0,0)", () => {
  const p = fromClient(100, 200, rect(100, 200, 540, 960));
  assert.deepStrictEqual(p, { x: 0, y: 0 });
});

test("fromClient maps the overlay's bottom-right to canvas (1080,1920)", () => {
  const p = fromClient(640, 1160, rect(100, 200, 540, 960));
  assert.deepStrictEqual(p, { x: 1080, y: 1920 });
});

test("fromClient maps the overlay's center to canvas center", () => {
  const p = fromClient(370, 680, rect(100, 200, 540, 960));
  assert.deepStrictEqual(p, { x: 540, y: 960 });
});

test("fromClient clamps points left/above the overlay to (0,0)", () => {
  const p = fromClient(-50, -50, rect(100, 200, 540, 960));
  assert.deepStrictEqual(p, { x: 0, y: 0 });
});

test("fromClient clamps points right/below the overlay to (1080,1920)", () => {
  const p = fromClient(1000, 1500, rect(100, 200, 540, 960));
  assert.deepStrictEqual(p, { x: 1080, y: 1920 });
});
