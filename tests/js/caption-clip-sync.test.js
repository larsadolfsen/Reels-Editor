// Pure timeline-splice + per-clip-delta helpers keeping caption words aligned with the MAIN
// clip they overlap when a clip is deleted, moved, or a new clip is inserted mid-sequence.
const test = require("node:test");
const assert = require("node:assert");
const { clipRanges, shiftCaptionsAfterEdit } = require("../../static/caption-clip-sync.js");

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

test("shiftCaptionsAfterEdit (delete): removes words inside the deleted range", () => {
  const words = [
    { id: "1", text: "a", t_start: 5, t_end: 5.4 },
    { id: "2", text: "b", t_start: 7, t_end: 7.4 },
  ];
  const result = shiftCaptionsAfterEdit(words, 5, 3, 0);
  assert.deepStrictEqual(result, []);
});

test("shiftCaptionsAfterEdit (delete): leaves earlier words untouched and shifts later ones left", () => {
  const words = [
    { id: "1", text: "before", t_start: 1, t_end: 1.4 },
    { id: "2", text: "inside", t_start: 6, t_end: 6.4 },
    { id: "3", text: "after", t_start: 10, t_end: 10.4 },
  ];
  // Clip deleted was [5, 8) — 3 seconds long.
  const result = shiftCaptionsAfterEdit(words, 5, 3, 0);
  assert.deepStrictEqual(result, [
    { id: "1", text: "before", t_start: 1, t_end: 1.4 },
    { id: "3", text: "after", t_start: 7, t_end: 7.4 },
  ]);
});

test("shiftCaptionsAfterEdit (delete): deleting the last clip removes with nothing to shift", () => {
  const words = [
    { id: "1", text: "before", t_start: 1, t_end: 1.4 },
    { id: "2", text: "inside", t_start: 6, t_end: 6.4 },
  ];
  const result = shiftCaptionsAfterEdit(words, 5, 3, 0);
  assert.deepStrictEqual(result, [{ id: "1", text: "before", t_start: 1, t_end: 1.4 }]);
});

test("shiftCaptionsAfterEdit (insert): words before the drop point are untouched", () => {
  const words = [{ id: "1", text: "before", t_start: 1, t_end: 1.4 }];
  const result = shiftCaptionsAfterEdit(words, 5, 0, 2.5);
  assert.deepStrictEqual(result, [{ id: "1", text: "before", t_start: 1, t_end: 1.4 }]);
});

test("shiftCaptionsAfterEdit (insert): words at/after the drop point shift right", () => {
  const words = [
    { id: "1", text: "at-point", t_start: 5, t_end: 5.4 },
    { id: "2", text: "after", t_start: 8, t_end: 8.4 },
  ];
  const result = shiftCaptionsAfterEdit(words, 5, 0, 2.5);
  assert.deepStrictEqual(result, [
    { id: "1", text: "at-point", t_start: 7.5, t_end: 7.9 },
    { id: "2", text: "after", t_start: 10.5, t_end: 10.9 },
  ]);
});

test("shiftCaptionsAfterEdit: returns a new array, does not mutate the input", () => {
  const words = [{ id: "1", text: "a", t_start: 1, t_end: 1.4 }];
  const result = shiftCaptionsAfterEdit(words, 5, 0, 2.5);
  assert.notStrictEqual(result, words);
  assert.strictEqual(words[0].t_start, 1);
});
