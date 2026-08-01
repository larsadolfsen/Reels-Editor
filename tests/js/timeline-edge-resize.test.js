const test = require("node:test");
const assert = require("node:assert");
const { computeEdgeResize } = require("../../static/timeline-edge-resize.js");

test("end edge: dragging right extends the end", () => {
  assert.deepStrictEqual(
    computeEdgeResize("end", 2, 5, 10, 0.1),
    { start: 5, end: 12 }
  );
});

test("end edge: dragging left shrinks the end, clamped to minDuration from start", () => {
  assert.deepStrictEqual(
    computeEdgeResize("end", -100, 5, 10, 0.1),
    { start: 5, end: 5.1 }
  );
});

test("start edge: dragging left extends the start backward", () => {
  assert.deepStrictEqual(
    computeEdgeResize("start", -2, 5, 10, 0.1),
    { start: 3, end: 10 }
  );
});

test("start edge: dragging right shrinks from the front, clamped to minDuration from end", () => {
  assert.deepStrictEqual(
    computeEdgeResize("start", 100, 5, 10, 0.1),
    { start: 9.9, end: 10 }
  );
});

test("start edge: dragging past zero clamps start to 0", () => {
  assert.deepStrictEqual(
    computeEdgeResize("start", -100, 5, 10, 0.1),
    { start: 0, end: 10 }
  );
});

test("zero dx is a no-op for either edge", () => {
  assert.deepStrictEqual(computeEdgeResize("start", 0, 5, 10, 0.1), { start: 5, end: 10 });
  assert.deepStrictEqual(computeEdgeResize("end", 0, 5, 10, 0.1), { start: 5, end: 10 });
});

test("end edge never moves start", () => {
  const result = computeEdgeResize("end", 3, 5, 10, 0.1);
  assert.strictEqual(result.start, 5);
});

test("start edge never moves end", () => {
  const result = computeEdgeResize("start", -3, 5, 10, 0.1);
  assert.strictEqual(result.end, 10);
});
