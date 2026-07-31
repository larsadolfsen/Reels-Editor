const test = require("node:test");
const assert = require("node:assert");
const { toRgba } = require("../../static/shape-color.js");

test("full opacity", () => {
  assert.strictEqual(toRgba("#FF0000", 1.0), "rgba(255, 0, 0, 1)");
});

test("partial opacity", () => {
  assert.strictEqual(toRgba("#00FF00", 0.5), "rgba(0, 255, 0, 0.5)");
});

test("zero opacity", () => {
  assert.strictEqual(toRgba("#0000FF", 0), "rgba(0, 0, 255, 0)");
});

test("lowercase hex", () => {
  assert.strictEqual(toRgba("#4c6fff", 1.0), "rgba(76, 111, 255, 1)");
});
