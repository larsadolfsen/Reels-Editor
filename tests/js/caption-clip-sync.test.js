// Pure timeline-splice + per-clip-delta helpers keeping caption words aligned with the MAIN
// clip they overlap when a clip is deleted, moved, or a new clip is inserted mid-sequence.
const test = require("node:test");
const assert = require("node:assert");
const { clipRanges, shiftCaptionsAfterEdit, resyncCaptionsAfterReorder } = require("../../static/caption-clip-sync.js");

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

test("resyncCaptionsAfterReorder: shifts each word by its owning clip's own delta", () => {
  // Old order: A(0-5), B(5-8), C(8-10). New order after moving C to the front: C(0-2), A(2-7), B(7-10).
  const oldRanges = [
    { id: "a", start: 0, end: 5 },
    { id: "b", start: 5, end: 8 },
    { id: "c", start: 8, end: 10 },
  ];
  const newRanges = [
    { id: "c", start: 0, end: 2 },
    { id: "a", start: 2, end: 7 },
    { id: "b", start: 7, end: 10 },
  ];
  const words = [
    { id: "1", text: "in-a", t_start: 1, t_end: 1.4 },
    { id: "2", text: "in-b", t_start: 6, t_end: 6.4 },
    { id: "3", text: "in-c", t_start: 9, t_end: 9.4 },
  ];
  const result = resyncCaptionsAfterReorder(words, oldRanges, newRanges);
  assert.deepStrictEqual(result, [
    { id: "1", text: "in-a", t_start: 3, t_end: 3.4 },     // A moved 0 -> 2, delta +2
    { id: "2", text: "in-b", t_start: 8, t_end: 8.4 },     // B moved 5 -> 7, delta +2
    { id: "3", text: "in-c", t_start: 1, t_end: 1.4 },     // C moved 8 -> 0, delta -8
  ]);
});

test("resyncCaptionsAfterReorder: a word exactly on a clip boundary resolves to the later clip", () => {
  const oldRanges = [
    { id: "a", start: 0, end: 5 },
    { id: "b", start: 5, end: 8 },
  ];
  const newRanges = [
    { id: "b", start: 0, end: 3 },
    { id: "a", start: 3, end: 8 },
  ];
  const words = [{ id: "1", text: "boundary", t_start: 5, t_end: 5.4 }];
  // t_start=5 belongs to B (half-open [5,8)), which moved 5 -> 0, delta -5.
  const result = resyncCaptionsAfterReorder(words, oldRanges, newRanges);
  assert.deepStrictEqual(result, [{ id: "1", text: "boundary", t_start: 0, t_end: 0.4 }]);
});

test("resyncCaptionsAfterReorder: a word outside every old range is left unchanged", () => {
  const oldRanges = [{ id: "a", start: 0, end: 5 }];
  const newRanges = [{ id: "a", start: 0, end: 5 }];
  const words = [{ id: "1", text: "past-end", t_start: 9, t_end: 9.4 }];
  const result = resyncCaptionsAfterReorder(words, oldRanges, newRanges);
  assert.deepStrictEqual(result, [{ id: "1", text: "past-end", t_start: 9, t_end: 9.4 }]);
});

test("resyncCaptionsAfterReorder: returns a new array, does not mutate the input", () => {
  const oldRanges = [{ id: "a", start: 0, end: 5 }];
  const newRanges = [{ id: "a", start: 2, end: 7 }];
  const words = [{ id: "1", text: "a", t_start: 1, t_end: 1.4 }];
  const result = resyncCaptionsAfterReorder(words, oldRanges, newRanges);
  assert.notStrictEqual(result, words);
  assert.strictEqual(words[0].t_start, 1);
});
