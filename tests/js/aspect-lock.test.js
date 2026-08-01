const test = require("node:test");
const assert = require("node:assert");
const { apply } = require("../../static/aspect-lock.js");

const from = { width: 300, height: 200 }; // 3:2

test("a pure north/south edge derives width from the dragged height", () => {
  assert.deepStrictEqual(apply(from, { width: 300, height: 400 }, "n"), { width: 600, height: 400 });
  assert.deepStrictEqual(apply(from, { width: 300, height: 400 }, "s"), { width: 600, height: 400 });
});

test("a pure east/west edge derives height from the dragged width", () => {
  assert.deepStrictEqual(apply(from, { width: 600, height: 200 }, "e"), { width: 600, height: 400 });
  assert.deepStrictEqual(apply(from, { width: 600, height: 200 }, "w"), { width: 600, height: 400 });
});

test("a pure vertical edge is not fooled by a rounding-noise width that differs from `from`", () => {
  // the width round-trips off by one pixel through the stage<->canvas scale conversion, but this
  // is still a pure "n" drag — height must stay the driver, not flip to width
  assert.deepStrictEqual(apply(from, { width: 301, height: 400 }, "n"), { width: 600, height: 400 });
});

test("a pure horizontal edge is not fooled by a rounding-noise height that differs from `from`", () => {
  assert.deepStrictEqual(apply(from, { width: 600, height: 201 }, "w"), { width: 600, height: 400 });
});

test("a corner edge falls back to whichever axis actually changed", () => {
  assert.deepStrictEqual(apply(from, { width: 600, height: 200 }, "ne"), { width: 600, height: 400 });
  assert.deepStrictEqual(apply(from, { width: 300, height: 400 }, "se"), { width: 600, height: 400 });
});
