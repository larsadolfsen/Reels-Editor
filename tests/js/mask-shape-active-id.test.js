const test = require("node:test");
const assert = require("node:assert");
const { maskActiveShapeId } = require("../../static/mask-shape-active-id.js");

test("maskActiveShapeId returns the shape id when it masks a video box only", () => {
  assert.strictEqual(maskActiveShapeId(true, false, "shape1"), "shape1");
});

test("maskActiveShapeId returns the shape id when it masks an image box only", () => {
  assert.strictEqual(maskActiveShapeId(false, true, "shape1"), "shape1");
});

test("maskActiveShapeId returns the shape id when it masks both a video and image box", () => {
  assert.strictEqual(maskActiveShapeId(true, true, "shape1"), "shape1");
});

test("maskActiveShapeId returns null when the shape masks neither box type", () => {
  assert.strictEqual(maskActiveShapeId(false, false, "shape1"), null);
});
