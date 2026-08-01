// Pure video-box slice helpers (isBoxActiveAt/isBoxSliceDisabled/sliceVideoBox), mirroring
// app-side main-clip slicing but keyed off a single VideoBoxLayer's own start/in/out fields.
const test = require("node:test");
const assert = require("node:assert");
const { isBoxActiveAt, isBoxSliceDisabled, sliceVideoBox } = require("../../static/timeline-slice.js");

function makeBox(overrides = {}) {
  return {
    id: "box1", media_id: "m1", file_path: "/a.mp4",
    in_point: 2, out_point: 12, start: 5,
    x: 100, y: 100, width: 300, height: 500, z_index: -1,
    mask_shape_id: null,
    ...overrides,
  };
}

test("isBoxActiveAt: true strictly inside the box's start..end window", () => {
  const box = makeBox(); // start=5, in=2, out=12 -> window [5, 15)
  assert.strictEqual(isBoxActiveAt(box, 5), true);   // at start (inclusive)
  assert.strictEqual(isBoxActiveAt(box, 10), true);  // well inside
  assert.strictEqual(isBoxActiveAt(box, 14.999), true);
});

test("isBoxActiveAt: false before start, at/after end", () => {
  const box = makeBox(); // window [5, 15)
  assert.strictEqual(isBoxActiveAt(box, 4.999), false);
  assert.strictEqual(isBoxActiveAt(box, 15), false);  // end is exclusive
  assert.strictEqual(isBoxActiveAt(box, 20), false);
});

test("isBoxSliceDisabled: disabled when box isn't active at t", () => {
  const box = makeBox(); // window [5, 15)
  assert.strictEqual(isBoxSliceDisabled(box, 4), true);
  assert.strictEqual(isBoxSliceDisabled(box, 16), true);
});

test("isBoxSliceDisabled: disabled within eps of start or end, enabled well inside", () => {
  const box = makeBox(); // window [5, 15)
  assert.strictEqual(isBoxSliceDisabled(box, 5.01, 0.05), true);   // within eps of start
  assert.strictEqual(isBoxSliceDisabled(box, 14.99, 0.05), true);  // within eps of end
  assert.strictEqual(isBoxSliceDisabled(box, 10, 0.05), false);    // well inside
});

test("isBoxSliceDisabled: enabled just outside eps of the boundary", () => {
  const box = makeBox(); // window [5, 15)
  assert.strictEqual(isBoxSliceDisabled(box, 5.06, 0.05), false);  // just past eps of start
});

test("sliceVideoBox: no-op (newId null, videoBoxes untouched) when box inactive at t", () => {
  const box = makeBox();
  const videoBoxes = [box];
  const result = sliceVideoBox(videoBoxes, box, 4, 0.05); // outside the window
  assert.strictEqual(result.newId, null);
  assert.strictEqual(videoBoxes.length, 1);
  assert.strictEqual(box.out_point, 12); // untouched
});

test("sliceVideoBox: no-op (newId null, videoBoxes untouched) when t is active but within eps of a boundary", () => {
  const box = makeBox(); // window [5, 15)
  const videoBoxes = [box];
  const result = sliceVideoBox(videoBoxes, box, 5.02, 0.05); // inside the window, near start
  assert.strictEqual(result.newId, null);
  assert.strictEqual(videoBoxes.length, 1);
  assert.strictEqual(box.out_point, 12); // untouched
});

test("sliceVideoBox: splits into two back-to-back boxes at t=10", () => {
  // Non-default mask/y/height values, distinguishable from x/width, so a copy-through bug
  // (e.g. mask fields silently reset to default, or y/x swapped) would actually be caught.
  const box = makeBox({
    y: 200, height: 500,
    mask_shape_id: "shape-abc",
  }); // start=5, in=2, out=12 -> window [5, 15)
  const videoBoxes = [box];
  const result = sliceVideoBox(videoBoxes, box, 10, 0.05);

  assert.notStrictEqual(result.newId, null);
  assert.strictEqual(videoBoxes.length, 2);

  // Original box: same id, position/size/z-index/mask unchanged, out_point trimmed to the split's
  // source time (in_point 2 + (10 - start 5) = 7).
  assert.strictEqual(box.id, "box1");
  assert.strictEqual(box.in_point, 2);
  assert.strictEqual(box.out_point, 7);
  assert.strictEqual(box.start, 5);
  assert.strictEqual(box.x, 100);
  assert.strictEqual(box.y, 200);
  assert.strictEqual(box.width, 300);
  assert.strictEqual(box.height, 500);
  assert.strictEqual(box.z_index, -1);
  assert.strictEqual(box.mask_shape_id, "shape-abc");

  // New box: new id, same position/size/z-index/mask/media, starts where the first half ends,
  // in_point continues from the split's source time, out_point unchanged from the original (12).
  const newBox = videoBoxes.find((b) => b.id === result.newId);
  assert.ok(newBox);
  assert.strictEqual(newBox.start, 10);
  assert.strictEqual(newBox.in_point, 7);
  assert.strictEqual(newBox.out_point, 12);
  assert.strictEqual(newBox.media_id, "m1");
  assert.strictEqual(newBox.file_path, "/a.mp4");
  assert.strictEqual(newBox.x, 100);
  assert.strictEqual(newBox.y, 200);
  assert.strictEqual(newBox.width, 300);
  assert.strictEqual(newBox.height, 500);
  assert.strictEqual(newBox.z_index, -1);
  assert.strictEqual(newBox.mask_shape_id, "shape-abc");
});
