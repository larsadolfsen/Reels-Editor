// Pure timeline-splice + per-clip-delta helpers keeping caption words aligned with the MAIN
// clip they overlap when a clip is deleted, moved, or a new clip is inserted mid-sequence.
const test = require("node:test");
const assert = require("node:assert");
const { clipRanges } = require("../../static/caption-clip-sync.js");

test("clipRanges: accumulates timeline start/end in order", () => {
  const clips = [
    { id: "a", in_point: 0, out_point: 5, order: 0 },
    { id: "b", in_point: 0, out_point: 3, order: 1 },
    { id: "c", in_point: 0, out_point: 2, order: 2 },
  ];
  assert.deepStrictEqual(clipRanges(clips), [
    { id: "a", start: 0, end: 5 },
    { id: "b", start: 5, end: 8 },
    { id: "c", start: 8, end: 10 },
  ]);
});

test("clipRanges: respects .order over array position", () => {
  const clips = [
    { id: "b", in_point: 0, out_point: 3, order: 1 },
    { id: "a", in_point: 0, out_point: 5, order: 0 },
  ];
  assert.deepStrictEqual(clipRanges(clips), [
    { id: "a", start: 0, end: 5 },
    { id: "b", start: 5, end: 8 },
  ]);
});

test("clipRanges: speed scales duration down for speed > 1", () => {
  const clips = [{ id: "a", in_point: 0, out_point: 10, order: 0, speed: 2 }];
  assert.deepStrictEqual(clipRanges(clips), [{ id: "a", start: 0, end: 5 }]);
});

test("clipRanges: missing speed defaults to 1", () => {
  const clips = [{ id: "a", in_point: 2, out_point: 6, order: 0 }];
  assert.deepStrictEqual(clipRanges(clips), [{ id: "a", start: 0, end: 4 }]);
});

test("clipRanges: empty clip list returns empty array", () => {
  assert.deepStrictEqual(clipRanges([]), []);
});
